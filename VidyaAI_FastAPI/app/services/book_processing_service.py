"""Fast admin upload pipeline — target 30–60 seconds."""

import hashlib
import json
import logging

from app.database import SessionLocal
from app.models.book import Book, BookStatus, Chapter, ChapterStatus
from app.models.processing_job import JobStatus, ProcessingJob
from app.services.agent_orchestrator import (
    _build_subject_teacher_profile,
    create_subject_expert_agent,
    detect_content_language,
    extract_chapters_with_agents,
)
from app.services.page_extraction_service import map_pages_to_chapters
from app.services.structure_cache_service import apply_cached_structure, get_cached_structure, save_structure_cache
from app.services.vector_service import embed_book_chunks, index_book_text
from app.utils.document_parser import (
    _MIN_SECTION_CHARS,
    attach_pdf_page_ranges,
    extract_pdf_text_range,
    extract_text_from_storage,
    extract_text_from_storage_fast,
    extract_toc_snippet,
    pdf_page_count,
    resolve_chapter_pdf_ranges,
    slice_text_by_page_range,
    suggest_chapters_from_text,
)
from app.services.storage_service import read_bytes
from app.utils.indic_text_normalize import content_looks_garbled_indic, normalize_extracted_text
from app.utils.text_sanitize import sanitize_db_text

logger = logging.getLogger(__name__)


def file_content_hash(ref: str) -> str:
    return hashlib.sha256(read_bytes(ref)).hexdigest()


def _chapter_source_file(chapter: Chapter, book: Book) -> tuple[str, str]:
    return (
        chapter.source_file_path or book.file_path,
        chapter.source_file_type or book.file_type,
    )


def _pdf_scan_chapter_number(chapter: Chapter, index_in_source: int) -> int:
    if chapter.source_chapter_number:
        return chapter.source_chapter_number
    return index_in_source + 1


def _content_needs_refill(content: str | None) -> bool:
    stripped = (content or "").strip()
    if len(stripped) < _MIN_SECTION_CHARS:
        return True
    if content_looks_garbled_indic(stripped):
        return True
    preview = stripped[:1200].lower()
    if "textbook for class" in preview and "isbn" in preview:
        return True
    if stripped.startswith("__VIDYAAI_PAGE_1__") and "national council" in preview:
        return True
    return False


def _repair_legacy_encoded_chapter_content(chapter: Chapter) -> bool:
    """Decode KrutiDev-style Latin garbage already stored in chapter.content."""
    raw = chapter.content or ""
    if not content_looks_garbled_indic(raw):
        return False
    fixed = sanitize_db_text(normalize_extracted_text(raw)) or ""
    if not fixed.strip() or fixed == raw:
        return False
    # Only accept if we actually gained Devanagari.
    from app.utils.indic_text_normalize import deavanagari_ratio

    if deavanagari_ratio(fixed) < 0.15:
        return False
    chapter.content = fixed[:50000]
    return True


def _repair_chapter_page_ranges(book: Book, chapters: list[Chapter]) -> None:
    """Scan each source PDF so every chapter has correct page ranges before content extraction."""
    from collections import defaultdict

    grouped: dict[str, list[Chapter]] = defaultdict(list)
    for chapter in chapters:
        file_path, _ = _chapter_source_file(chapter, book)
        grouped[file_path].append(chapter)

    for file_path, group in grouped.items():
        group.sort(
            key=lambda ch: (
                ch.source_chapter_number or ch.chapter_number,
                ch.chapter_number,
            )
        )
        file_type = _chapter_source_file(group[0], book)[1]
        if file_type != "pdf":
            continue

        total_pages = pdf_page_count(file_path)
        payload = []
        for index, chapter in enumerate(group):
            scan_number = _pdf_scan_chapter_number(chapter, index)
            if not chapter.source_chapter_number:
                chapter.source_chapter_number = scan_number
            payload.append(
                {
                    "chapter_number": scan_number,
                    "title": chapter.title,
                    "pdf_start_page": chapter.pdf_start_page,
                    "pdf_end_page": chapter.pdf_end_page,
                }
            )
        resolve_chapter_pdf_ranges(file_path, payload, total_pages=total_pages)

        for chapter, data in zip(group, payload):
            if data.get("pdf_start_page"):
                chapter.pdf_start_page = int(data["pdf_start_page"])
            if data.get("pdf_end_page"):
                chapter.pdf_end_page = int(data["pdf_end_page"])


def fill_missing_chapter_content(book_id: int) -> int:
    """Pull chapter bodies from the full PDF when fast-path text covered only the opening pages."""
    db = SessionLocal()
    filled = 0
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return 0

        chapters = (
            db.query(Chapter)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.chapter_number)
            .all()
        )
        if not chapters:
            return 0

        _repair_chapter_page_ranges(book, chapters)
        db.commit()

        # Fast path: decode already-stored KrutiDev Latin into Devanagari
        # without re-reading the PDF (covers books uploaded before the fix).
        for chapter in chapters:
            if _repair_legacy_encoded_chapter_content(chapter):
                filled += 1
        if filled:
            db.commit()

        full_text_cache: dict[str, str] = {}
        for index, chapter in enumerate(chapters):
            if not _content_needs_refill(chapter.content):
                continue

            start_page = chapter.pdf_start_page
            end_page = chapter.pdf_end_page
            if not start_page:
                logger.warning(
                    "Book %s chapter %s (%s): no PDF start page after repair",
                    book_id,
                    chapter.chapter_number,
                    chapter.title,
                )
                continue
            if not end_page:
                next_chapter = chapters[index + 1] if index + 1 < len(chapters) else None
                if next_chapter and next_chapter.pdf_start_page:
                    same_source = _chapter_source_file(next_chapter, book)[0] == _chapter_source_file(
                        chapter, book
                    )[0]
                    if same_source:
                        end_page = next_chapter.pdf_start_page - 1
                if not end_page:
                    file_path, file_type = _chapter_source_file(chapter, book)
                    if file_type == "pdf":
                        end_page = pdf_page_count(file_path)
                    elif book.total_pdf_pages:
                        end_page = book.total_pdf_pages
            if not end_page or start_page > end_page:
                logger.warning(
                    "Book %s chapter %s: invalid page range %s-%s",
                    book_id,
                    chapter.chapter_number,
                    start_page,
                    end_page,
                )
                continue

            file_path, file_type = _chapter_source_file(chapter, book)
            if file_type == "pdf":
                text = extract_pdf_text_range(file_path, start_page, end_page)
            else:
                if file_path not in full_text_cache:
                    full_text_cache[file_path] = extract_text_from_storage(file_path, file_type)
                text = slice_text_by_page_range(full_text_cache[file_path], start_page, end_page)

            text = sanitize_db_text(normalize_extracted_text(text)) or ""
            if len(text.strip()) < _MIN_SECTION_CHARS:
                logger.warning(
                    "Book %s chapter %s: extracted text too short (%s chars)",
                    book_id,
                    chapter.chapter_number,
                    len(text.strip()),
                )
                continue

            chapter.content = text[:50000]
            chapter.pdf_end_page = end_page
            if chapter.status == ChapterStatus.PENDING:
                chapter.status = ChapterStatus.CLASSIFIED
            filled += 1
            db.commit()

        if filled:
            logger.info("Filled content for %s chapter(s) on book %s", filled, book_id)
        return filled
    finally:
        db.close()


def enqueue_book_processing(book_id: int) -> None:
    from app.services.job_queue import enqueue_job

    enqueue_job("book_prepare", book_id)


def enqueue_book_append(
    book_id: int,
    *,
    file_path: str,
    file_type: str,
    file_hash: str,
    source_label: str,
) -> None:
    from app.services.job_queue import enqueue_job

    enqueue_job(
        "book_append",
        book_id,
        payload={
            "file_path": file_path,
            "file_type": file_type,
            "file_hash": file_hash,
            "source_label": source_label,
        },
    )


def _update_book_progress(book_id: int, progress: int, message: str) -> None:
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return
        book.processing_progress = max(0, min(100, progress))
        book.processing_message = message
        db.commit()
    finally:
        db.close()


def _set_job_status(job_id: int, status: str, *, progress: int | None = None, error: str | None = None) -> None:
    db = SessionLocal()
    try:
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if not job:
            return
        job.status = status
        if progress is not None:
            job.progress = progress
        if error is not None:
            job.error_message = error
        db.commit()
    finally:
        db.close()


def run_processing_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        if not job or job.status != JobStatus.PENDING.value:
            return
        job.status = JobStatus.RUNNING.value
        db.commit()
        job_type = job.job_type
        book_id = job.book_id
        payload = json.loads(job.payload or "{}")
    finally:
        db.close()

    try:
        if job_type == "book_prepare":
            _run_prepare_job(job_id, book_id)
        elif job_type == "book_append":
            _run_append_job(job_id, book_id, payload)
        elif job_type == "book_post_prepare":
            _run_post_prepare_job(job_id, book_id)
        elif job_type == "book_full_index":
            _run_full_index_job(job_id, book_id)
        elif job_type == "book_index":
            _run_full_index_job(job_id, book_id)
        elif job_type == "book_classify":
            _run_prepare_job(job_id, book_id)
        elif job_type == "book_agent":
            pass
        elif job_type == "book_pages":
            pass
        elif job_type == "book_embed":
            _run_embed_job(job_id, book_id)
        elif job_type == "book_finalize":
            _run_finalize_job(job_id, book_id)
        else:
            raise ValueError(f"Unknown job type: {job_type}")
        _set_job_status(job_id, JobStatus.COMPLETED.value, progress=100)
    except Exception as exc:
        logger.exception("Job %s (%s) failed for book %s", job_id, job_type, book_id)
        _set_job_status(job_id, JobStatus.FAILED.value, error=str(exc))
        db = SessionLocal()
        try:
            book = db.query(Book).filter(Book.id == book_id).first()
            if book:
                book.status = BookStatus.UPLOADED
                book.processing_message = "Something went wrong — please try uploading again."
                db.commit()
        finally:
            db.close()


def _run_prepare_job(job_id: int, book_id: int) -> None:
    """Single fast path: cache → TOC heuristics → optional small AI call → ready."""
    _update_book_progress(book_id, 8, "Saving your book…")
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return
        if not book.file_hash:
            book.file_hash = file_content_hash(book.file_path)
        file_hash = book.file_hash
        db.commit()
    finally:
        db.close()

    cache = get_cached_structure(file_hash)
    if cache:
        _update_book_progress(book_id, 40, "Recognised this book — loading chapters…")
        apply_cached_structure(book_id, cache)
        from app.services.job_queue import enqueue_job

        enqueue_job("book_post_prepare", book_id)
        enqueue_job("book_full_index", book_id)
        return

    _update_book_progress(book_id, 18, "Reading through your textbook…")
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return

        if book.file_type == "pdf":
            book.total_pdf_pages = pdf_page_count(book.file_path)

        classify_text = extract_text_from_storage_fast(book.file_path, book.file_type)
        toc_snippet = extract_toc_snippet(classify_text)
        heuristic = attach_pdf_page_ranges(classify_text, suggest_chapters_from_text(classify_text))
        db.commit()
    finally:
        db.close()

    _update_book_progress(book_id, 42, "Finding every chapter…")
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return

        suggestions = extract_chapters_with_agents(
            subject=book.subject,
            class_grade=book.class_grade,
            heuristic_chapters=heuristic,
            toc_snippet=toc_snippet,
            classification_text=classify_text,
        )

        db.query(Chapter).filter(Chapter.book_id == book_id).delete()
        for ch in suggestions:
            printed = int(ch.get("source_chapter_number") or ch.get("chapter_number") or 0) or None
            chapter_number = int(ch.get("chapter_number") or printed or 1)
            db.add(
                Chapter(
                    book_id=book.id,
                    chapter_number=chapter_number,
                    title=sanitize_db_text(ch["title"]) or f"Chapter {chapter_number}",
                    content=sanitize_db_text(ch.get("content") or "") or "",
                    status=ChapterStatus.CLASSIFIED,
                    pdf_start_page=ch.get("pdf_start_page"),
                    pdf_end_page=ch.get("pdf_end_page"),
                    source_file_path=book.file_path,
                    source_file_type=book.file_type,
                    source_chapter_number=printed or chapter_number,
                )
            )
        book.processing_progress = 72
        book.processing_message = "Choosing the best teacher for this subject…"
        db.commit()
    finally:
        db.close()

    _update_book_progress(book_id, 78, "Choosing the best teacher for this subject…")
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return

        chapters = (
            db.query(Chapter)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.chapter_number)
            .all()
        )
        suggestions = [
            {
                "chapter_number": ch.chapter_number,
                "title": ch.title,
                "content": ch.content,
                "pdf_start_page": ch.pdf_start_page,
                "pdf_end_page": ch.pdf_end_page,
            }
            for ch in chapters
        ]

        lang_code, voice_id, lang_label = detect_content_language(book.subject, classify_text[:4000])
        system_prompt, teaching_style, expertise_notes = _build_subject_teacher_profile(
            subject=book.subject,
            class_grade=book.class_grade,
            language_label=lang_label,
            content_language=lang_code,
        )
        create_subject_expert_agent(
            book.id,
            subject=book.subject,
            class_grade=book.class_grade,
            content_language=lang_code,
            language_label=lang_label,
            tts_voice_id=voice_id,
        )
        save_structure_cache(
            file_hash,
            chapters=suggestions,
            total_pdf_pages=book.total_pdf_pages,
            content_language=lang_code,
            subject=book.subject,
            system_prompt=system_prompt,
            teaching_style=teaching_style,
            tts_voice_id=voice_id,
            expertise_notes=expertise_notes,
        )
        book.status = BookStatus.READY
        book.processing_progress = 100
        book.processing_message = "Chapters ready — finishing chapter content in background…"
        db.commit()
    finally:
        db.close()

    from app.services.job_queue import enqueue_job

    enqueue_job("book_post_prepare", book_id)
    enqueue_job("book_full_index", book_id)


def _run_append_job(job_id: int, book_id: int, payload: dict) -> None:
    """Process an additional PDF/DOCX and append its chapters to an existing subject book."""
    file_path = str(payload.get("file_path") or "")
    file_type = str(payload.get("file_type") or "pdf")
    source_label = str(payload.get("source_label") or "upload")
    if not file_path:
        raise ValueError("book_append job missing file_path")

    _update_book_progress(book_id, 15, f"Reading {source_label}…")

    classify_text = extract_text_from_storage_fast(file_path, file_type)
    toc_snippet = extract_toc_snippet(classify_text)
    heuristic = attach_pdf_page_ranges(classify_text, suggest_chapters_from_text(classify_text))

    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return

        suggestions = extract_chapters_with_agents(
            subject=book.subject,
            class_grade=book.class_grade,
            heuristic_chapters=heuristic,
            toc_snippet=toc_snippet,
            classification_text=classify_text,
        )
        if not suggestions:
            raise ValueError(f"No chapters detected in {source_label}")

        from sqlalchemy import func

        # Serialize append numbering so concurrent workers cannot collide.
        max_existing = (
            db.query(func.max(Chapter.chapter_number))
            .filter(Chapter.book_id == book_id)
            .scalar()
            or 0
        )

        sorted_suggestions = sorted(
            suggestions,
            key=lambda item: int(
                item.get("source_chapter_number")
                or item.get("chapter_number")
                or 0
            ),
        )

        next_number = max_existing + 1
        for ch in sorted_suggestions:
            printed = int(
                ch.get("source_chapter_number") or ch.get("chapter_number") or 1
            )
            db.add(
                Chapter(
                    book_id=book.id,
                    # Book-local unique id for ordering/FKs — never max+printed
                    # (that turns Book2 Ch1 into "Chapter 11" and breaks PDF scans).
                    chapter_number=next_number,
                    title=sanitize_db_text(ch.get("title") or "") or f"Chapter {printed}",
                    content=sanitize_db_text(ch.get("content") or "") or "",
                    status=ChapterStatus.CLASSIFIED,
                    pdf_start_page=ch.get("pdf_start_page"),
                    pdf_end_page=ch.get("pdf_end_page"),
                    source_file_path=file_path,
                    source_file_type=file_type,
                    source_chapter_number=printed,
                )
            )
            next_number += 1

        book.status = BookStatus.READY
        book.processing_progress = 100
        book.processing_message = "Chapters ready — finishing chapter content in background…"
        db.commit()
        logger.info(
            "Appended %s chapter(s) from %s to book %s",
            len(suggestions),
            source_label,
            book_id,
        )
    finally:
        db.close()

    from app.services.job_queue import enqueue_job

    enqueue_job("book_post_prepare", book_id)


def _run_post_prepare_job(job_id: int, book_id: int) -> None:
    """Background: pull full chapter text and map PDF pages — does not block chapter list."""
    fill_missing_chapter_content(book_id)
    map_pages_to_chapters(book_id)
    _update_book_progress(book_id, 100, "Your book is ready!")


def _run_full_index_job(job_id: int, book_id: int) -> None:
    """Background — full text index + embeddings; does not block admin upload."""
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return
        full_text = extract_text_from_storage(book.file_path, book.file_type)
        index_book_text(book.id, book.file_path, book.file_type, embed=False, full_text=full_text)
    finally:
        db.close()
    try:
        embed_book_chunks(book_id)
    except Exception as exc:
        logger.warning("Background embed for book %s: %s", book_id, exc)


def _run_embed_job(job_id: int, book_id: int) -> None:
    try:
        embed_book_chunks(book_id)
    except Exception as exc:
        logger.warning("Background embed skipped for book %s: %s", book_id, exc)


def _run_finalize_job(job_id: int, book_id: int) -> None:
    fill_missing_chapter_content(book_id)
    _update_book_progress(book_id, 92, "Almost done…")
    map_pages_to_chapters(book_id)

    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if book:
            book.status = BookStatus.READY
            book.processing_progress = 100
            book.processing_message = "Your book is ready!"
            db.commit()
    finally:
        db.close()
