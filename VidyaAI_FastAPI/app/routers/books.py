import hashlib
import json
import os
import re
import tempfile
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.constants.routes import api_path
from app.database import get_db
from app.models.user import User, UserRole
from app.models.school import School
from app.models.book import Book, BookStatus, Chapter, ChapterStatus, LecturePart, LectureSchedule, LectureVisualFrame, StudentProgress
from app.models.support_chat import SupportChatMessage
from app.schemas.book import (
    BookResponse,
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    GenerateLecturesRequest,
    LecturePartResponse,
    LectureSegmentResponse,
    LectureSessionResponse,
    ManualBookCreate,
    VisualFrameResponse,
)
from app.utils.security import (
    get_current_user,
    get_chapter_for_user,
    get_lecture_part_for_user,
    get_current_user_bearer_or_query,
)
from app.utils.service_access import require_school_admin_with_services
from app.constants.programs import normalize_program, is_school_program
from app.utils.program_access import (
    apply_book_program_filters,
    apply_student_book_scope,
    book_visible_to_user,
    effective_exam_track,
)
from app.utils.chapter_labels import chapter_display_label
from app.utils.document_parser import extract_text_from_file
from app.utils.text_sanitize import sanitize_db_text
from app.services.storage_service import (
    StorageUnavailableError,
    delete as delete_storage,
    exists as storage_exists,
    storage_file_response,
    write_bytes,
)
from app.utils.media_paths import book_original_key
from app.utils.storage_scope import scope_for_admin, scope_for_book
from app.services.audio_regen_service import (
    get_audio_error,
    get_audio_progress,
    is_generating_audio,
    regenerate_audio_for_lecture_id,
    should_retry_audio,
)
from app.services.image_migration_service import delete_image_file
from app.services.book_processing_service import enqueue_book_append, enqueue_book_processing
from app.services.schedule_service import find_schedule_for_session, live_session_info
from app.services.lecture_service import generate_lectures_for_chapter_id
from app.services.tts_service import count_polly_chunks
from app.services.visual_regen_service import is_generating_visuals, regenerate_visuals_for_lecture_id
from app.services.visual_service import split_script_into_segments, segment_timings

router = APIRouter(prefix="/api/books", tags=["books"])

require_school_admin = require_school_admin_with_services("lectures")


def _find_subject_book(
    db: Session,
    *,
    school_id: int,
    program: str,
    class_grade: int,
    exam_track: str | None,
    subject: str,
) -> Book | None:
    q = db.query(Book).filter(
        Book.school_id == school_id,
        Book.program == program,
        Book.subject.ilike(subject.strip()),
    )
    if is_school_program(program):
        q = q.filter(Book.class_grade == class_grade)
    elif exam_track:
        q = q.filter(Book.exam_track == exam_track)
    return q.order_by(Book.id.asc()).first()


def _load_book_response(db: Session, book_id: int) -> Book:
    book = (
        db.query(Book)
        .options(joinedload(Book.chapters).joinedload(Chapter.lecture_parts).joinedload(LecturePart.visual_frames))
        .filter(Book.id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _lecture_to_response(lp) -> LecturePartResponse:
    audio_url = api_path(f"/api/books/lectures/{lp.id}/audio") if lp.audio_path else None
    has_visuals = bool(getattr(lp, "visual_frames", None)) and len(lp.visual_frames) > 0
    return LecturePartResponse(
        id=lp.id,
        part_number=lp.part_number,
        title=lp.title,
        duration_minutes=lp.duration_minutes,
        word_count=lp.word_count,
        status=lp.status,
        audio_url=audio_url,
        summary=lp.summary,
        has_visuals=has_visuals,
    )


def _chapter_to_response(ch: Chapter) -> ChapterResponse:
    source_num = ch.source_chapter_number
    return ChapterResponse(
        id=ch.id,
        chapter_number=ch.chapter_number,
        source_chapter_number=source_num,
        title=ch.title,
        display_label=chapter_display_label(ch.chapter_number, ch.title, source_num),
        content=ch.content,
        status=ch.status,
        lecture_parts=[_lecture_to_response(lp) for lp in sorted(ch.lecture_parts, key=lambda x: x.part_number)],
    )


def _book_to_response(book: Book) -> BookResponse:
    return BookResponse(
        id=book.id,
        class_grade=book.class_grade,
        subject=book.subject,
        title=book.title,
        file_type=book.file_type,
        status=book.status,
        created_at=book.created_at,
        program=book.program,
        exam_track=book.exam_track,
        chapters=[_chapter_to_response(ch) for ch in sorted(book.chapters, key=lambda x: x.chapter_number)],
        processing_progress=book.processing_progress or 0,
        processing_message=book.processing_message,
    )


def _run_lecture_generation(
    chapter_id: int,
    lecture_language: str = "english",
    lecture_persona: str = "warm",
):
    generate_lectures_for_chapter_id(
        chapter_id,
        lecture_language=lecture_language,
        lecture_persona=lecture_persona,
    )


@router.post("/upload", response_model=BookResponse)
async def upload_book(
    class_grade: int = Form(..., ge=0, le=12),
    subject: str = Form(...),
    title: str = Form(...),
    program: str = Form("school"),
    exam_track: str = Form(""),
    file: UploadFile = File(...),
    school_id: int | None = Form(None),
    book_id: int | None = Form(None),
    merge_into_subject: bool = Form(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    if not user.school_id:
        raise HTTPException(status_code=400, detail="Admin must belong to a school")

    target_school_id = user.school_id

    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ("pdf", "docx", "doc"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    school = db.query(School).filter(School.id == target_school_id).first()
    scope = scope_for_admin(user, school)
    safe_name = f"{uuid.uuid4()}.{ext}"
    file_key = book_original_key(scope, safe_name)
    content = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum upload size is {settings.max_upload_size_mb} MB.",
        )
    content_type = "application/pdf" if ext == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    file_hash = hashlib.sha256(content).hexdigest()
    stored_ref = write_bytes(file_key, content, content_type=content_type)
    file_type = "docx" if ext == "doc" else ext

    program = normalize_program(program)
    admin_program = normalize_program(user.program)
    if program != admin_program:
        raise HTTPException(
            status_code=403,
            detail=f"Your account can only upload {admin_program} curriculum",
        )

    if is_school_program(program) and class_grade < 1:
        raise HTTPException(status_code=400, detail="Class grade (1–12) required for school books")

    resolved_track = effective_exam_track(program, exam_track) if not is_school_program(program) else None
    if not is_school_program(program):
        admin_track = effective_exam_track(user.program, user.exam_track)
        if resolved_track != admin_track:
            raise HTTPException(
                status_code=403,
                detail=f"Your account can only upload books for the {admin_track} track",
            )

    target_book: Book | None = None
    if book_id is not None:
        target_book = (
            db.query(Book)
            .filter(Book.id == book_id, Book.school_id == target_school_id)
            .first()
        )
        if not target_book:
            raise HTTPException(status_code=404, detail="Book not found")
    elif merge_into_subject:
        target_book = _find_subject_book(
            db,
            school_id=target_school_id,
            program=program,
            class_grade=class_grade if is_school_program(program) else 0,
            exam_track=resolved_track,
            subject=subject,
        )

    if target_book:
        if title.strip():
            target_book.title = title.strip()
        target_book.status = BookStatus.PROCESSING
        target_book.processing_progress = 5
        target_book.processing_message = "Adding lessons from new file…"
        db.commit()

        enqueue_book_append(
            target_book.id,
            file_path=stored_ref,
            file_type=file_type,
            file_hash=file_hash,
            source_label=file.filename or safe_name,
        )
        return _book_to_response(_load_book_response(db, target_book.id))

    book = Book(
        school_id=target_school_id,
        uploaded_by_id=user.id,
        class_grade=class_grade if is_school_program(program) else 0,
        subject=subject,
        title=title,
        file_path=stored_ref,
        file_type=file_type,
        file_hash=file_hash,
        status=BookStatus.PROCESSING,
        program=program,
        exam_track=resolved_track,
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    book.processing_progress = 5
    book.processing_message = "Saving your book…"
    db.commit()

    enqueue_book_processing(book.id)

    return _book_to_response(_load_book_response(db, book.id))


@router.post("/{book_id}/refresh-content")
def refresh_book_chapter_content(
    book_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    """Backfill chapter text from the full PDF when only opening pages were indexed."""
    from app.services.book_processing_service import fill_missing_chapter_content

    q = db.query(Book).filter(Book.id == book_id)
    if user.role == UserRole.ADMIN:
        q = q.filter(Book.school_id == user.school_id)
    book = q.first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    filled = fill_missing_chapter_content(book_id)
    book = (
        db.query(Book)
        .options(joinedload(Book.chapters).joinedload(Chapter.lecture_parts).joinedload(LecturePart.visual_frames))
        .filter(Book.id == book_id)
        .first()
    )
    return {
        "book": _book_to_response(book),
        "chapters_filled": filled,
        "message": f"Updated content for {filled} chapter(s)." if filled else "All chapters already had content.",
    }


@router.delete("/{book_id}")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    q = (
        db.query(Book)
        .options(joinedload(Book.chapters).joinedload(Chapter.lecture_parts).joinedload(LecturePart.visual_frames))
        .filter(Book.id == book_id)
    )
    if user.role == UserRole.ADMIN:
        q = q.filter(Book.school_id == user.school_id)
    book = q.first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    lecture_part_ids = [
        lp.id for ch in book.chapters for lp in ch.lecture_parts
    ]
    chapter_ids = [ch.id for ch in book.chapters]

    if lecture_part_ids:
        db.query(StudentProgress).filter(
            StudentProgress.lecture_part_id.in_(lecture_part_ids)
        ).delete(synchronize_session=False)

    # Support chat rows reference chapters without ORM cascade — clear them first.
    if chapter_ids:
        db.query(SupportChatMessage).filter(
            SupportChatMessage.chapter_id.in_(chapter_ids)
        ).delete(synchronize_session=False)

    for ch in book.chapters:
        for lp in ch.lecture_parts:
            if lp.audio_path:
                delete_storage(lp.audio_path)
            for frame in lp.visual_frames:
                if frame.image_path:
                    delete_image_file(frame.image_path)

    if book.file_path:
        delete_storage(book.file_path)

    db.delete(book)
    db.commit()
    return {"message": "Book deleted", "book_id": book_id}


@router.get("", response_model=list[BookResponse])
def list_books(
    class_grade: int | None = None,
    subject: str | None = None,
    program: str | None = None,
    exam_track: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Book).options(
        joinedload(Book.chapters).joinedload(Chapter.lecture_parts).joinedload(LecturePart.visual_frames)
    )

    if user.role == UserRole.ADMIN:
        if not user.school_id:
            return []
        q = q.filter(Book.school_id == user.school_id)
        admin_program = normalize_program(user.program)
        q = apply_book_program_filters(
            q,
            program=program or admin_program,
            class_grade=class_grade if (program or admin_program) == "school" else None,
            exam_track=exam_track or user.exam_track,
        )
    elif user.role == UserRole.STUDENT:
        q = apply_student_book_scope(q, user)
    elif user.role != UserRole.SUPER_ADMIN:
        return []

    if class_grade and not program:
        q = q.filter(Book.class_grade == class_grade)
    if subject:
        q = q.filter(Book.subject.ilike(f"%{subject}%"))

    books = q.all()
    return [_book_to_response(b) for b in books]


@router.get("/{book_id}", response_model=BookResponse)
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    book = (
        db.query(Book)
        .options(joinedload(Book.chapters).joinedload(Chapter.lecture_parts).joinedload(LecturePart.visual_frames))
        .filter(Book.id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if user.role in (UserRole.ADMIN, UserRole.STUDENT) and book.school_id != user.school_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if user.role == UserRole.STUDENT and not book_visible_to_user(book, user):
        raise HTTPException(status_code=403, detail="This resource is not available in your learning path")
    return _book_to_response(book)


@router.post("/extract-text")
async def extract_chapter_text(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    """Extract plain text from a single PDF/DOCX for individual chapter context.

    PDF files are also stored so non-math subjects can show textbook page context.
    """
    if not user.school_id:
        raise HTTPException(status_code=400, detail="Admin must belong to a school")

    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ("pdf", "docx", "doc"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    raw = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum upload size is {settings.max_upload_size_mb} MB.",
        )

    file_type = "docx" if ext == "doc" else ext
    tmp_path = ""
    stored_ref: str | None = None
    pdf_pages: int | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        text = extract_text_from_file(tmp_path, file_type)

        school = db.query(School).filter(School.id == user.school_id).first()
        scope = scope_for_admin(user, school)
        safe_name = f"{uuid.uuid4()}.{ext}"
        stored_ref = write_bytes(
            book_original_key(scope, safe_name),
            raw,
            content_type=(
                "application/pdf"
                if file_type == "pdf"
                else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
        )
        if file_type == "pdf":
            from app.utils.document_parser import pdf_page_count

            pdf_pages = pdf_page_count(stored_ref)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read file: {exc}") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    cleaned = re.sub(r"__VIDYAAI_PAGE_\d+__\s*", "\n", text or "")
    cleaned = sanitize_db_text(cleaned).strip()
    if len(cleaned) < 100:
        raise HTTPException(
            status_code=400,
            detail="Could not extract enough text from this file. Try another file or type the context.",
        )

    return {
        "text": cleaned,
        "char_count": len(cleaned),
        "file_name": file.filename or f"chapter.{ext}",
        "source_file_path": stored_ref,
        "source_file_type": file_type,
        "pdf_page_count": pdf_pages,
    }


@router.post("/manual", response_model=BookResponse)
def create_manual_book(
    data: ManualBookCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    """Create a book from chapter number, name, and context (no file upload)."""
    if not user.school_id:
        raise HTTPException(status_code=400, detail="Admin must belong to a school")
    if not data.chapters:
        raise HTTPException(status_code=400, detail="Add at least one chapter")

    program = normalize_program(data.program)
    admin_program = normalize_program(user.program)
    if program != admin_program:
        raise HTTPException(
            status_code=403,
            detail=f"Your account can only create {admin_program} curriculum",
        )

    if is_school_program(program) and data.class_grade < 1:
        raise HTTPException(status_code=400, detail="Class grade (1–12) required for school books")

    resolved_track = effective_exam_track(program, data.exam_track) if not is_school_program(program) else None
    if not is_school_program(program):
        admin_track = effective_exam_track(user.program, user.exam_track)
        if resolved_track != admin_track:
            raise HTTPException(
                status_code=403,
                detail=f"Your account can only create books for the {admin_track} track",
            )

    subject = (data.subject or "").strip()
    title = (data.title or "").strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Subject is required")
    if not title:
        raise HTTPException(status_code=400, detail="Book title is required")

    seen_numbers: set[int] = set()
    cleaned_chapters = []
    for idx, ch in enumerate(data.chapters, start=1):
        number = int(ch.chapter_number)
        ch_title = (ch.title or "").strip()
        content = sanitize_db_text((ch.content or "").strip())
        source_path = (ch.source_file_path or "").strip() or None
        source_type = (ch.source_file_type or "").strip().lower() or None
        if number <= 0:
            raise HTTPException(status_code=400, detail=f"Chapter {idx}: enter a valid chapter number")
        if number in seen_numbers:
            raise HTTPException(status_code=400, detail=f"Duplicate chapter number: {number}")
        if not ch_title:
            raise HTTPException(status_code=400, detail=f"Chapter {number}: name is required")
        if len(content) < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Chapter {number}: add more context (at least 100 characters)",
            )
        seen_numbers.add(number)
        cleaned_chapters.append((number, ch_title, content, source_path, source_type, ch.pdf_page_count))

    cleaned_chapters.sort(key=lambda item: item[0])

    pdf_chapters = [c for c in cleaned_chapters if c[4] == "pdf" and c[3]]
    primary_pdf = pdf_chapters[0] if pdf_chapters else None

    book = Book(
        school_id=user.school_id,
        uploaded_by_id=user.id,
        class_grade=data.class_grade if is_school_program(program) else 0,
        subject=subject,
        title=title,
        file_path=primary_pdf[3] if primary_pdf else "",
        file_type="pdf" if primary_pdf else "manual",
        file_hash=None,
        status=BookStatus.READY,
        program=program,
        exam_track=resolved_track,
        processing_progress=100,
        processing_message="Manual chapters ready",
        total_pdf_pages=primary_pdf[5] if primary_pdf else None,
    )
    db.add(book)
    db.flush()

    for number, ch_title, content, source_path, source_type, pdf_pages in cleaned_chapters:
        db.add(
            Chapter(
                book_id=book.id,
                chapter_number=number,
                source_chapter_number=number,
                title=ch_title,
                content=content,
                status=ChapterStatus.CLASSIFIED,
                source_file_path=source_path,
                source_file_type=source_type,
                pdf_start_page=1 if source_type == "pdf" and source_path == book.file_path and pdf_pages else None,
                pdf_end_page=pdf_pages if source_type == "pdf" and source_path == book.file_path and pdf_pages else None,
            )
        )

    db.commit()
    return _book_to_response(_load_book_response(db, book.id))


@router.post("/{book_id}/chapters", response_model=ChapterResponse)
def add_chapter(
    book_id: int,
    data: ChapterCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    q = db.query(Book).filter(Book.id == book_id)
    if user.role == UserRole.ADMIN:
        q = q.filter(Book.school_id == user.school_id)
    book = q.first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    chapter = Chapter(
        book_id=book_id,
        chapter_number=data.chapter_number,
        source_chapter_number=data.chapter_number,
        title=data.title,
        content=data.content,
        status=ChapterStatus.CLASSIFIED if data.content else ChapterStatus.PENDING,
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return _chapter_to_response(chapter)


@router.patch("/chapters/{chapter_id}", response_model=ChapterResponse)
def update_chapter(
    chapter_id: int,
    data: ChapterUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    chapter = (
        db.query(Chapter)
        .join(Book)
        .options(joinedload(Chapter.lecture_parts))
        .filter(Chapter.id == chapter_id)
        .first()
    )
    if chapter and user.role == UserRole.ADMIN:
        book = db.query(Book).filter(Book.id == chapter.book_id).first()
        if book and book.school_id != user.school_id:
            chapter = None
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, field, value)
    if chapter.content:
        chapter.status = ChapterStatus.CLASSIFIED
    db.commit()
    db.refresh(chapter)
    return _chapter_to_response(chapter)


def _start_chapter_generation(
    db: Session,
    chapter: Chapter,
    background_tasks: BackgroundTasks,
    *,
    lecture_language: str = "english",
    lecture_persona: str = "warm",
) -> dict | None:
    """Queue generation for one chapter. Returns result dict or None if skipped."""
    if not chapter.content:
        return {"chapter_id": chapter.id, "status": "skipped", "reason": "no content"}
    if chapter.status == ChapterStatus.GENERATING:
        return {"chapter_id": chapter.id, "status": "generating", "reason": "already in progress"}

    chapter.status = ChapterStatus.GENERATING
    db.commit()
    background_tasks.add_task(
        _run_lecture_generation,
        chapter.id,
        lecture_language,
        lecture_persona,
    )
    return {"chapter_id": chapter.id, "status": "started"}


@router.post("/chapters/generate-lectures")
def generate_lectures_for_selected(
    data: GenerateLecturesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    """Generate lectures only for the chapter IDs sent by the client."""
    if not data.chapter_ids:
        raise HTTPException(status_code=400, detail="Select at least one chapter")

    unique_ids = list(dict.fromkeys(data.chapter_ids))
    results: list[dict] = []

    for chapter_id in unique_ids:
        chapter = get_chapter_for_user(db, chapter_id, user)
        if not chapter:
            results.append({"chapter_id": chapter_id, "status": "skipped", "reason": "not found"})
            continue
        outcome = _start_chapter_generation(
            db,
            chapter,
            background_tasks,
            lecture_language=data.lecture_language,
            lecture_persona=data.lecture_persona,
        )
        if outcome:
            results.append(outcome)

    started = [r["chapter_id"] for r in results if r.get("status") == "started"]
    return {
        "message": f"Started generation for {len(started)} chapter(s)",
        "started_chapter_ids": started,
        "results": results,
    }


@router.post("/chapters/{chapter_id}/generate-lecture")
def generate_lecture(
    chapter_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    """Single-chapter generate (same rules as bulk — selected chapter only)."""
    chapter = get_chapter_for_user(db, chapter_id, user)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    outcome = _start_chapter_generation(db, chapter, background_tasks)
    if outcome and outcome.get("status") == "skipped" and outcome.get("reason") == "no content":
        raise HTTPException(status_code=400, detail="Chapter needs content before generating lectures")

    return {
        "message": "Lecture generation started",
        "chapter_id": chapter_id,
        "status": outcome.get("status", "started") if outcome else "started",
    }


@router.get("/chapters/{chapter_id}/status")
def get_chapter_status(
    chapter_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_school_admin),
):
    chapter = get_chapter_for_user(db, chapter_id, user)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    parts = (
        db.query(LecturePart)
        .filter(LecturePart.chapter_id == chapter_id)
        .order_by(LecturePart.part_number)
        .all()
    )
    return {
        "chapter_id": chapter_id,
        "status": chapter.status.value,
        "lecture_parts": [
            {
                "id": p.id,
                "part_number": p.part_number,
                "title": p.title,
                "status": p.status.value,
                "duration_minutes": p.duration_minutes,
                "audio_url": api_path(f"/api/books/lectures/{p.id}/audio") if p.audio_path else None,
            }
            for p in parts
        ],
    }


def _run_audio_regeneration(lecture_id: int):
    regenerate_audio_for_lecture_id(lecture_id)


def _run_visual_regeneration(lecture_id: int):
    regenerate_visuals_for_lecture_id(lecture_id)


@router.get("/lectures/{lecture_id}/session", response_model=LectureSessionResponse)
def get_lecture_session(
    lecture_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lecture = (
        db.query(LecturePart)
        .options(
            joinedload(LecturePart.visual_frames),
            joinedload(LecturePart.chapter).joinedload(Chapter.book),
        )
        .filter(LecturePart.id == lecture_id)
        .first()
    )
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    book = lecture.chapter.book
    if user.role in (UserRole.ADMIN, UserRole.STUDENT):
        if not user.school_id or book.school_id != user.school_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if user.role == UserRole.STUDENT and not book_visible_to_user(book, user):
            raise HTTPException(status_code=403, detail="This resource is not available in your learning path")

    frames = sorted(lecture.visual_frames, key=lambda item: item.frame_number)
    if frames:
        from app.services.page_extraction_service import get_chapter_pages
        from app.services.page_visual_service import summarize_page_text

        page_text_by_number = {
            page.page_number: page.text_content
            for page in get_chapter_pages(lecture.chapter_id)
        }

        segments = [
            LectureSegmentResponse(
                index=index,
                text=frame.segment_text,
                start_seconds=frame.start_seconds,
                duration_seconds=frame.duration_seconds,
            )
            for index, frame in enumerate(frames)
        ]
        frame_responses = []
        for frame in frames:
            source_type = frame.source_type or "generated"
            page_summary: str | None = None
            if source_type == "document" and frame.book_page_number:
                page_summary = summarize_page_text(
                    page_text_by_number.get(frame.book_page_number)
                ) or None
            frame_responses.append(
                VisualFrameResponse(
                    id=frame.id,
                    frame_number=frame.frame_number,
                    caption=frame.caption,
                    segment_text=frame.segment_text,
                    image_url=(
                        ""
                        if (frame.source_type or "") == "board" or not (frame.image_path or "").strip()
                        else api_path(f"/api/books/lectures/frames/{frame.id}/image")
                    ),
                    start_seconds=frame.start_seconds,
                    duration_seconds=frame.duration_seconds,
                    book_page_number=frame.book_page_number,
                    source_type=source_type,
                    page_summary=page_summary,
                )
            )
    else:
        script_segments = split_script_into_segments(lecture.script or "")
        total_seconds = max(lecture.duration_minutes * 60, 60)
        timings = segment_timings(script_segments, total_seconds)
        segments = [
            LectureSegmentResponse(
                index=index,
                text=text,
                start_seconds=start,
                duration_seconds=duration,
            )
            for index, (text, (start, duration)) in enumerate(zip(script_segments, timings))
        ]
        frame_responses = []

    visual_status = "ready"
    if is_generating_visuals(lecture_id):
        visual_status = "generating"
    elif lecture.script:
        note_frames = [frame for frame in frames if (frame.source_type or "") == "notes"]
        has_notes = bool(note_frames)

        def _notes_have_timed_lines(frame) -> bool:
            try:
                data = json.loads(frame.segment_text or "{}")
                lines = data.get("lines") if isinstance(data, dict) else None
                return isinstance(lines, list) and len(lines) > 0
            except Exception:
                return False

        has_timed_lines = has_notes and all(_notes_have_timed_lines(f) for f in note_frames)
        if has_notes and has_timed_lines:
            visual_status = "ready"
        else:
            background_tasks.add_task(_run_visual_regeneration, lecture_id)
            visual_status = "generating"
    else:
        visual_status = "unavailable"

    audio_error: str | None = None
    audio_chunks_completed: int | None = None
    audio_chunks_total: int | None = None

    audio_storage_unavailable = False
    try:
        audio_file_ready = bool(lecture.audio_path) and storage_exists(lecture.audio_path)
    except StorageUnavailableError:
        # A transient S3/network outage must not fail the classroom session
        # or erase a valid stored object reference.
        audio_file_ready = False
        audio_storage_unavailable = True

    if lecture.audio_path and not audio_file_ready and not audio_storage_unavailable:
        # DB points at a missing file (e.g. deleted from S3) — clear and regenerate.
        lecture.audio_path = None
        db.commit()

    if audio_storage_unavailable:
        audio_status = "failed"
        audio_error = "Audio storage is temporarily unavailable. Refresh to retry."
    elif audio_file_ready:
        audio_status = "ready"
    elif is_generating_audio(lecture_id):
        audio_status = "generating"
        progress = get_audio_progress(lecture_id)
        if progress:
            audio_chunks_completed = progress["completed"]
            audio_chunks_total = progress["total"]
    elif lecture.script and should_retry_audio(lecture_id):
        background_tasks.add_task(_run_audio_regeneration, lecture_id)
        audio_status = "generating"
        total_chunks = count_polly_chunks(lecture.script)
        audio_chunks_completed = 0
        audio_chunks_total = total_chunks
    elif lecture.script:
        audio_status = "failed"
        audio_error = get_audio_error(lecture_id) or "Audio generation failed. Refresh to retry."
    else:
        audio_status = "unavailable"

    schedule = find_schedule_for_session(
        db,
        chapter_id=lecture.chapter_id,
        school_id=user.school_id,
    )
    if schedule:
        db.commit()

    lecture_duration_seconds = max(lecture.duration_minutes * 60, 60)
    live_info = live_session_info(
        schedule,
        max_position_seconds=lecture_duration_seconds,
    )

    return LectureSessionResponse(
        lecture_id=lecture.id,
        chapter_id=lecture.chapter_id,
        title=lecture.title,
        chapter_title=lecture.chapter.title,
        subject=book.subject,
        class_grade=book.class_grade,
        audio_url=api_path(f"/api/books/lectures/{lecture.id}/audio") if audio_file_ready else None,
        duration_minutes=lecture.duration_minutes,
        script=lecture.script,
        segments=segments,
        frames=frame_responses,
        visual_status=visual_status,
        audio_status=audio_status,
        audio_error=audio_error,
        audio_chunks_completed=audio_chunks_completed,
        audio_chunks_total=audio_chunks_total,
        live_status=live_info["live_status"],
        scheduled_at=live_info["scheduled_at"],
        live_position_seconds=live_info["live_position_seconds"],
        is_live=live_info["is_live"],
        auto_play=live_info["auto_play"],
        schedule_id=schedule.id if schedule else None,
    )


@router.get("/lectures/frames/{frame_id}/image")
def get_lecture_frame_image(
    frame_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_bearer_or_query),
):
    frame = (
        db.query(LectureVisualFrame)
        .options(joinedload(LectureVisualFrame.lecture_part).joinedload(LecturePart.chapter).joinedload(Chapter.book))
        .filter(LectureVisualFrame.id == frame_id)
        .first()
    )
    if not frame:
        raise HTTPException(status_code=404, detail="Image not found")

    if (frame.source_type or "") == "board" or not (frame.image_path or "").strip():
        raise HTTPException(status_code=404, detail="Board frames have no textbook image")

    if not storage_exists(frame.image_path):
        raise HTTPException(status_code=404, detail="Image file missing")
    try:
        return storage_file_response(
            frame.image_path,
            media_type="image/png",
            headers={"Access-Control-Expose-Headers": "Content-Length"},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image file missing") from None


@router.get("/lectures/{lecture_id}/audio")
def get_lecture_audio(
    lecture_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user_bearer_or_query),
):
    from app.models.book import LecturePart

    lecture = db.query(LecturePart).filter(LecturePart.id == lecture_id).first()
    if not lecture or not lecture.audio_path:
        raise HTTPException(status_code=404, detail="Audio not found")

    if not storage_exists(lecture.audio_path):
        raise HTTPException(status_code=404, detail="Audio file missing")
    try:
        return storage_file_response(
            lecture.audio_path,
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges": "bytes",
                "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
            },
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio file missing") from None
