import logging
import re

import fitz

from app.database import SessionLocal
from app.models.book import Book, BookPage, Chapter, ChapterPage
from app.services.storage_service import exists, local_read_path, write_bytes
from app.utils.indic_text_normalize import normalize_extracted_text
from app.utils.media_paths import book_page_image_path
from app.utils.storage_scope import scope_for_book
from app.utils.text_sanitize import sanitize_db_text

logger = logging.getLogger(__name__)

_CHAPTER_PAGE_HEADING = re.compile(
    r"(?:^|\s)(?:chapter|ch\.?)\s*(\d+)\b",
    re.IGNORECASE,
)


def extract_pdf_pages_to_images(
    file_ref: str,
    *,
    scope,
    class_grade: int,
    subject: str,
    book_id: int,
    start_page: int = 1,
    end_page: int | None = None,
    store_page_offset: int = 0,
) -> list[dict]:
    """Render PDF pages to PNG and return page metadata.

    store_page_offset shifts stored book page numbers so multiple chapter PDFs
    can share one book without overwriting each other (PDF page 1 → offset+1).
    """
    pages: list[dict] = []

    with local_read_path(file_ref, suffix=".pdf") as pdf_path:
        doc = fitz.open(str(pdf_path))
        try:
            last_page = end_page or len(doc)
            first_index = max(0, start_page - 1)
            last_index = min(len(doc), last_page)
            for index in range(first_index, last_index):
                pdf_page_number = index + 1
                page_number = pdf_page_number + store_page_offset
                page = doc.load_page(index)
                text = sanitize_db_text(normalize_extracted_text((page.get_text() or "").strip())) or ""
                image_key = book_page_image_path(
                    scope,
                    class_grade=class_grade,
                    subject=subject,
                    book_id=book_id,
                    page_number=page_number,
                )
                pix = page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
                stored_ref = write_bytes(image_key, pix.tobytes("png"), content_type="image/png")
                pages.append(
                    {
                        "page_number": page_number,
                        "image_path": stored_ref,
                        "text_content": text,
                    }
                )
        finally:
            doc.close()

    return pages


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _title_tokens(title: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", title.lower())
    return {w for w in words if len(w) > 2 and w not in {"chapter", "unit", "the", "and", "for"}}


def map_pages_to_chapters(book_id: int) -> int:
    """Assign book pages to chapters using stored PDF ranges, then keyword fallback."""
    db = SessionLocal()
    mapped = 0
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return 0

        pages = db.query(BookPage).filter(BookPage.book_id == book_id).order_by(BookPage.page_number).all()
        chapters = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.chapter_number).all()
        if not pages or not chapters:
            return 0

        for chapter in chapters:
            db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter.id).delete()

        pages_by_number = {page.page_number: page for page in pages}
        range_mapped = False
        chapters_with_ranges = [
            ch for ch in chapters if ch.pdf_start_page and ch.pdf_end_page
        ]
        chapters_without_ranges = [
            ch for ch in chapters if not (ch.pdf_start_page and ch.pdf_end_page)
        ]

        for chapter in chapters_with_ranges:
            chapter_pages = [
                pages_by_number[num]
                for num in range(chapter.pdf_start_page, chapter.pdf_end_page + 1)
                if num in pages_by_number
            ]
            if chapter_pages:
                range_mapped = True
                for order_index, page in enumerate(chapter_pages):
                    db.add(
                        ChapterPage(
                            chapter_id=chapter.id,
                            book_page_id=page.id,
                            order_index=order_index,
                        )
                    )
                    mapped += 1

        if range_mapped and not chapters_without_ranges:
            db.commit()
            return mapped

        if range_mapped:
            db.commit()

        chapters_for_fallback = chapters_without_ranges if range_mapped else chapters
        chapter_tokens = {ch.id: _title_tokens(ch.title) for ch in chapters_for_fallback}
        # Match printed "Chapter N" headings to source_chapter_number (TOC number),
        # not the remapped book-local chapter_number used after multi-file append.
        chapter_by_number: dict[int, Chapter] = {}
        for ch in chapters_for_fallback:
            printed = ch.source_chapter_number or ch.chapter_number
            chapter_by_number.setdefault(printed, ch)
            chapter_by_number.setdefault(ch.chapter_number, ch)
        chapter_page_ids: dict[int, list[int]] = {ch.id: [] for ch in chapters_for_fallback}
        current_chapter_id = chapters_for_fallback[0].id

        for page in pages:
            page_text = _normalize(page.text_content or "")
            matched_id = current_chapter_id

            heading_match = _CHAPTER_PAGE_HEADING.search(page_text)
            if heading_match:
                chapter_num = int(heading_match.group(1))
                chapter_for_num = chapter_by_number.get(chapter_num)
                if chapter_for_num:
                    matched_id = chapter_for_num.id
                    current_chapter_id = chapter_for_num.id

            for chapter in chapters_for_fallback:
                tokens = chapter_tokens[chapter.id]
                if not tokens:
                    continue
                hits = sum(1 for token in tokens if token in page_text)
                title_in_page = _normalize(chapter.title)[:40] in page_text
                if title_in_page or hits >= max(2, len(tokens) // 2):
                    matched_id = chapter.id
                    current_chapter_id = chapter.id
                    break

            chapter_page_ids[matched_id].append(page.id)

        for chapter in chapters_for_fallback:
            page_ids = chapter_page_ids[chapter.id]
            if not page_ids and len(chapters_for_fallback) == 1:
                page_ids = [page.id for page in pages]
            elif not page_ids:
                continue

            for order_index, page_id in enumerate(page_ids):
                db.add(
                    ChapterPage(
                        chapter_id=chapter.id,
                        book_page_id=page_id,
                        order_index=order_index,
                    )
                )
                mapped += 1

        db.commit()
        return mapped
    finally:
        db.close()


def extract_pdf_pages_range(
    book_id: int,
    start_page: int,
    end_page: int,
    *,
    source_file_path: str | None = None,
    store_page_offset: int = 0,
    pdf_start_page: int | None = None,
    pdf_end_page: int | None = None,
) -> int:
    """Render and store a page range for a book, skipping pages that already exist.

    When chapters come from an appended PDF, pass that chapter's source_file_path
    so pages are taken from the correct file — not only book.file_path.

    For a standalone chapter PDF, pass pdf_start_page/pdf_end_page as 1..N in the
    source file and store_page_offset so stored book page numbers do not collide.
    """
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book or book.file_type != "pdf":
            return 0

        pdf_path = (source_file_path or "").strip() or book.file_path
        source_start = pdf_start_page or (start_page - store_page_offset)
        source_end = pdf_end_page or (end_page - store_page_offset)
        if source_start < 1:
            source_start = 1

        existing_numbers = {
            row.page_number
            for row in db.query(BookPage.page_number).filter(BookPage.book_id == book_id).all()
        }
        if all(num in existing_numbers for num in range(start_page, end_page + 1)):
            if pdf_path == book.file_path or not source_file_path or store_page_offset == 0:
                return 0

        scope = scope_for_book(book, db)
        page_data = extract_pdf_pages_to_images(
            pdf_path,
            scope=scope,
            class_grade=book.class_grade,
            subject=book.subject,
            book_id=book.id,
            start_page=source_start,
            end_page=source_end,
            store_page_offset=store_page_offset,
        )
        created = 0
        for item in page_data:
            existing = (
                db.query(BookPage)
                .filter(
                    BookPage.book_id == book.id,
                    BookPage.page_number == item["page_number"],
                )
                .first()
            )
            if existing:
                existing.image_path = item["image_path"]
                existing.text_content = item["text_content"]
                continue
            db.add(
                BookPage(
                    book_id=book.id,
                    page_number=item["page_number"],
                    image_path=item["image_path"],
                    text_content=item["text_content"],
                )
            )
            created += 1
        db.commit()
        return created
    finally:
        db.close()


def ensure_chapter_page_images(chapter_id: int) -> int:
    """Ensure chapter pages are rendered and mapped before lecture visuals."""
    db = SessionLocal()
    try:
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if not chapter:
            return 0
        book = db.query(Book).filter(Book.id == chapter.book_id).first()
        if not book:
            return 0

        source_path = (chapter.source_file_path or book.file_path or "").strip()
        file_type = (chapter.source_file_type or book.file_type or "").strip().lower()
        if file_type != "pdf" or not source_path:
            return 0

        from app.utils.document_parser import pdf_page_count

        # Standalone chapter PDF (different from book file): store with a unique page offset.
        if chapter.source_file_path and chapter.source_file_path != (book.file_path or ""):
            pdf_pages = pdf_page_count(source_path)
            if pdf_pages <= 0:
                return 0
            max_page = (
                db.query(BookPage.page_number)
                .filter(BookPage.book_id == book.id)
                .order_by(BookPage.page_number.desc())
                .limit(1)
                .scalar()
            ) or 0
            # Keep existing range if already allocated and pages exist.
            if (
                chapter.pdf_start_page
                and chapter.pdf_end_page
                and chapter.pdf_end_page > chapter.pdf_start_page
                and db.query(BookPage)
                .filter(
                    BookPage.book_id == book.id,
                    BookPage.page_number >= chapter.pdf_start_page,
                    BookPage.page_number <= chapter.pdf_end_page,
                )
                .count()
                >= (chapter.pdf_end_page - chapter.pdf_start_page + 1)
            ):
                map_chapter_pages_by_range(chapter_id)
                return db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter_id).count()

            offset = max_page
            chapter.pdf_start_page = offset + 1
            chapter.pdf_end_page = offset + pdf_pages
            db.commit()
            extract_pdf_pages_range(
                book.id,
                chapter.pdf_start_page,
                chapter.pdf_end_page,
                source_file_path=source_path,
                store_page_offset=offset,
                pdf_start_page=1,
                pdf_end_page=pdf_pages,
            )
            map_chapter_pages_by_range(chapter_id)
            return db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter_id).count()

        if chapter.pdf_start_page and chapter.pdf_end_page:
            extract_pdf_pages_range(
                book.id,
                chapter.pdf_start_page,
                chapter.pdf_end_page,
                source_file_path=source_path,
            )
            map_chapter_pages_by_range(chapter_id)
            return db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter_id).count()

        existing = db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter_id).count()
        if existing:
            return existing

        if not db.query(BookPage).filter(BookPage.book_id == book.id).count():
            extract_and_store_book_pages(book.id)
        map_pages_to_chapters(book.id)
        return db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter_id).count()
    finally:
        db.close()


def map_chapter_pages_by_range(chapter_id: int) -> int:
    db = SessionLocal()
    mapped = 0
    try:
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if not chapter or not chapter.pdf_start_page or not chapter.pdf_end_page:
            return 0

        pages = (
            db.query(BookPage)
            .filter(
                BookPage.book_id == chapter.book_id,
                BookPage.page_number >= chapter.pdf_start_page,
                BookPage.page_number <= chapter.pdf_end_page,
            )
            .order_by(BookPage.page_number)
            .all()
        )
        db.query(ChapterPage).filter(ChapterPage.chapter_id == chapter.id).delete()
        for order_index, page in enumerate(pages):
            db.add(
                ChapterPage(
                    chapter_id=chapter.id,
                    book_page_id=page.id,
                    order_index=order_index,
                )
            )
            mapped += 1
        db.commit()
        return mapped
    finally:
        db.close()


def repair_missing_book_page_images(book_id: int) -> int:
    """Re-render PDF pages whose PNG files are missing from storage."""
    db = SessionLocal()
    repaired = 0
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book or book.file_type != "pdf":
            return 0

        pages = (
            db.query(BookPage)
            .filter(BookPage.book_id == book_id)
            .order_by(BookPage.page_number)
            .all()
        )
        if not pages:
            return 0

        seen_pages: set[int] = set()
        with local_read_path(book.file_path, suffix=".pdf") as pdf_path:
            doc = fitz.open(str(pdf_path))
            try:
                for page in pages:
                    if page.page_number in seen_pages:
                        continue
                    seen_pages.add(page.page_number)

                    if exists(page.image_path):
                        continue
                    if page.page_number < 1 or page.page_number > len(doc):
                        continue

                    pdf_page = doc.load_page(page.page_number - 1)
                    pix = pdf_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    write_bytes(page.image_path, pix.tobytes("png"), content_type="image/png")
                    repaired += 1
            finally:
                doc.close()

        if repaired:
            logger.info("Repaired %s missing page image(s) for book %s", repaired, book_id)
        return repaired
    finally:
        db.close()


def extract_and_store_book_pages(book_id: int) -> int:
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book or book.file_type != "pdf":
            return 0

        existing = db.query(BookPage).filter(BookPage.book_id == book_id).count()
        if existing:
            repair_missing_book_page_images(book_id)
            return existing

        scope = scope_for_book(book, db)
        page_data = extract_pdf_pages_to_images(
            book.file_path,
            scope=scope,
            class_grade=book.class_grade,
            subject=book.subject,
            book_id=book.id,
        )
        for item in page_data:
            db.add(
                BookPage(
                    book_id=book.id,
                    page_number=item["page_number"],
                    image_path=item["image_path"],
                    text_content=item["text_content"],
                )
            )
        db.commit()
        return len(page_data)
    finally:
        db.close()


def get_chapter_pages(chapter_id: int) -> list[BookPage]:
    db = SessionLocal()
    try:
        links = (
            db.query(ChapterPage)
            .filter(ChapterPage.chapter_id == chapter_id)
            .order_by(ChapterPage.order_index)
            .all()
        )
        if not links:
            return []

        page_ids = [link.book_page_id for link in links]
        pages = db.query(BookPage).filter(BookPage.id.in_(page_ids)).all()
        by_id = {page.id: page for page in pages}
        return [by_id[page_id] for page_id in page_ids if page_id in by_id]
    finally:
        db.close()
