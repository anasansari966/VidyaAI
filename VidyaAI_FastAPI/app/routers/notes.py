"""Student notes:
1) Complete CBSE/class study notes (Notes section)
2) Lecture-synced notes (classroom timeline)
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.book import Book, Chapter, ChapterStudyNote, LecturePart
from app.models.user import User, UserRole
from app.services.study_notes_service import (
    ensure_chapter_study_notes,
    is_generating_study_notes,
    notes_need_regeneration,
    resolve_board,
)
from app.utils.program_access import apply_student_book_scope, book_visible_to_user
from app.utils.service_access import require_student_service

router = APIRouter(prefix="/api/notes", tags=["notes"])


class TopicSummaryOut(BaseModel):
    topic_index: int
    title: str
    preview: str = ""
    has_examples: bool = False
    has_questions: bool = False
    key_point_count: int = 0


class StudyNoteListItem(BaseModel):
    chapter_id: int
    title: str
    chapter_title: str
    subject: str
    class_grade: int
    board: str
    topic_count: int
    status: str
    lecture_id: int | None = None
    topics: list[TopicSummaryOut] = []


class SubjectNotesCard(BaseModel):
    subject: str
    class_grade: int
    board: str
    chapter_count: int
    ready_count: int
    generating_count: int
    topic_count: int


class StudyTopicOut(BaseModel):
    title: str
    theory: str
    formulas: list[str] = []
    examples: list[str] = []
    worked_examples: list[dict] = []
    key_points: list[str] = []
    questions_with_answers: list[dict] = []
    practice: list[dict] = []
    exam_tips: list[str] = []


class StudyNoteDetailOut(BaseModel):
    chapter_id: int
    title: str
    chapter_title: str
    subject: str
    class_grade: int
    board: str
    status: str
    overview: str
    topics: list[StudyTopicOut]
    questions_with_answers: list[dict] = []
    revision_sheet: list[str] = []
    important_questions: list[str] = []
    exam_tips: list[str] = []
    lecture_id: int | None = None


class ChapterTopicsOut(BaseModel):
    chapter_id: int
    chapter_title: str
    subject: str
    class_grade: int
    board: str
    status: str
    overview: str = ""
    topics: list[TopicSummaryOut]
    lecture_id: int | None = None


class TopicDetailOut(BaseModel):
    chapter_id: int
    chapter_title: str
    subject: str
    class_grade: int
    board: str
    topic_index: int
    topic_count: int
    prev_index: int | None = None
    next_index: int | None = None
    topic: StudyTopicOut


class NotePageOut(BaseModel):
    page_number: int
    title: str
    summary: str
    transcript: str = ""
    lines: list[dict] = []
    sections: list[dict]
    key_points: list[str]
    practice: list[dict] = []
    start_seconds: float
    duration_seconds: float


class LectureSyncedNoteOut(BaseModel):
    lecture_id: int
    chapter_id: int
    title: str
    chapter_title: str
    subject: str
    class_grade: int
    board: str = "CBSE"
    pages: list[NotePageOut]


def _parse_notes_payload(segment_text: str) -> dict:
    try:
        data = json.loads(segment_text or "{}")
        if isinstance(data, dict) and data.get("mode") == "notes":
            return data
    except Exception:
        pass
    return {
        "mode": "notes",
        "title": "Notes",
        "summary": (segment_text or "")[:280],
        "sections": [{"heading": "Notes", "body": segment_text or "", "bullets": []}],
        "key_points": [],
    }


def _parse_study_payload(content_json: str) -> dict[str, Any]:
    try:
        data = json.loads(content_json or "{}")
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _chapter_accessible(chapter: Chapter, user: User) -> bool:
    book = chapter.book
    if not book:
        return False
    if user.role == UserRole.STUDENT:
        if not user.school_id or book.school_id != user.school_id:
            return False
        return book_visible_to_user(book, user)
    if user.role == UserRole.ADMIN:
        return bool(user.school_id and book.school_id == user.school_id)
    return user.role == UserRole.SUPER_ADMIN


def _lecture_accessible(lecture: LecturePart, user: User) -> bool:
    chapter = lecture.chapter
    if not chapter:
        return False
    return _chapter_accessible(chapter, user)


def _first_lecture_id(chapter: Chapter) -> int | None:
    parts = sorted(chapter.lecture_parts or [], key=lambda p: p.part_number)
    return parts[0].id if parts else None


def _user_board(user: User) -> str:
    return resolve_board(getattr(user, "board", None))


def _chapter_query(db: Session, user: User):
    q = (
        db.query(Chapter)
        .join(Book, Chapter.book_id == Book.id)
        .options(
            joinedload(Chapter.book),
            joinedload(Chapter.study_notes),
            joinedload(Chapter.lecture_parts),
        )
    )
    if user.role == UserRole.STUDENT:
        q = apply_student_book_scope(q, user)
    elif user.role == UserRole.ADMIN and user.school_id:
        q = q.filter(Book.school_id == user.school_id)
    return q


def _iter_accessible_chapters(db: Session, user: User) -> list[Chapter]:
    chapters = (
        _chapter_query(db, user)
        .order_by(Book.subject.asc(), Book.class_grade.asc(), Chapter.chapter_number.asc())
        .all()
    )
    out: list[Chapter] = []
    for chapter in chapters:
        if not chapter.book or not _chapter_accessible(chapter, user):
            continue
        if not (chapter.content or "").strip() and not (chapter.lecture_parts or []):
            continue
        out.append(chapter)
    return out


def _topic_summaries_from_payload(payload: dict[str, Any]) -> list[TopicSummaryOut]:
    topics_raw = payload.get("topics") if isinstance(payload.get("topics"), list) else []
    out: list[TopicSummaryOut] = []
    for index, item in enumerate(topics_raw):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or f"Topic {index + 1}").strip()
        theory = str(item.get("theory") or "").strip()
        preview = theory[:180] + ("…" if len(theory) > 180 else "")
        worked = item.get("worked_examples") or item.get("examples") or []
        qa = item.get("questions_with_answers") or []
        key_points = item.get("key_points") or []
        out.append(
            TopicSummaryOut(
                topic_index=index,
                title=title,
                preview=preview,
                has_examples=bool(worked),
                has_questions=bool(qa),
                key_point_count=len(key_points) if isinstance(key_points, list) else 0,
            )
        )
    return out


def _study_topic_from_raw(item: dict[str, Any]) -> StudyTopicOut:
    return StudyTopicOut(
        title=str(item.get("title") or ""),
        theory=str(item.get("theory") or ""),
        formulas=list(item.get("formulas") or []),
        examples=list(item.get("examples") or []),
        worked_examples=list(item.get("worked_examples") or []),
        key_points=list(item.get("key_points") or []),
        questions_with_answers=list(item.get("questions_with_answers") or []),
        practice=list(item.get("practice") or []),
        exam_tips=list(item.get("exam_tips") or []),
    )


def _load_chapter_for_notes(db: Session, chapter_id: int, user: User) -> Chapter:
    chapter = (
        db.query(Chapter)
        .options(
            joinedload(Chapter.book),
            joinedload(Chapter.study_notes),
            joinedload(Chapter.lecture_parts),
        )
        .filter(Chapter.id == chapter_id)
        .first()
    )
    if not chapter or not _chapter_accessible(chapter, user):
        raise HTTPException(status_code=404, detail="Notes not found")
    return chapter


def _chapter_list_item(chapter: Chapter, board: str, background_tasks: BackgroundTasks) -> StudyNoteListItem:
    note = chapter.study_notes
    needs_gen = notes_need_regeneration(note)
    if needs_gen and not is_generating_study_notes(chapter.id):
        background_tasks.add_task(ensure_chapter_study_notes, chapter.id, board=board, force=False)
    status = "generating" if needs_gen or is_generating_study_notes(chapter.id) else "ready"
    topics: list[TopicSummaryOut] = []
    topic_count = 0
    if note and status == "ready":
        payload = _parse_study_payload(note.content_json)
        topics = _topic_summaries_from_payload(payload)
        topic_count = len(topics) or note.topic_count
    title = (note.title if note else None) or f"{chapter.title} · Detailed notes"
    return StudyNoteListItem(
        chapter_id=chapter.id,
        title=title,
        chapter_title=chapter.title,
        subject=chapter.book.subject,
        class_grade=chapter.book.class_grade,
        board=(note.board if note else board) or board,
        topic_count=topic_count,
        status=status,
        lecture_id=_first_lecture_id(chapter),
        topics=topics,
    )


@router.get("/subjects", response_model=list[SubjectNotesCard])
def list_subject_note_cards(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Isolated subject cards for the Notes section."""
    board = _user_board(user)
    chapters = _iter_accessible_chapters(db, user)
    grouped: dict[str, dict] = {}

    for chapter in chapters:
        subject = chapter.book.subject or "General"
        key = f"{subject}|{chapter.book.class_grade}|{(chapter.study_notes.board if chapter.study_notes else board) or board}"
        if key not in grouped:
            grouped[key] = {
                "subject": subject,
                "class_grade": chapter.book.class_grade,
                "board": (chapter.study_notes.board if chapter.study_notes else board) or board,
                "chapter_count": 0,
                "ready_count": 0,
                "generating_count": 0,
                "topic_count": 0,
            }
        item = _chapter_list_item(chapter, board, background_tasks)
        bucket = grouped[key]
        bucket["chapter_count"] += 1
        bucket["topic_count"] += item.topic_count
        if item.status == "ready":
            bucket["ready_count"] += 1
        else:
            bucket["generating_count"] += 1

    return [
        SubjectNotesCard(
            subject=row["subject"],
            class_grade=row["class_grade"],
            board=row["board"],
            chapter_count=row["chapter_count"],
            ready_count=row["ready_count"],
            generating_count=row["generating_count"],
            topic_count=row["topic_count"],
        )
        for row in sorted(grouped.values(), key=lambda r: (r["subject"].lower(), r["class_grade"]))
    ]


@router.get("/by-subject", response_model=list[StudyNoteListItem])
def list_chapters_for_subject(
    subject: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Chapter cards inside one subject."""
    board = _user_board(user)
    subject_key = (subject or "").strip().lower()
    chapters = [
        c
        for c in _iter_accessible_chapters(db, user)
        if (c.book.subject or "").strip().lower() == subject_key
    ]
    if not chapters:
        raise HTTPException(status_code=404, detail="No notes for this subject")
    return [_chapter_list_item(chapter, board, background_tasks) for chapter in chapters]


@router.get("", response_model=list[StudyNoteListItem])
def list_complete_notes(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Complete curriculum notes for the Notes section (by chapter)."""
    board = _user_board(user)
    return [_chapter_list_item(chapter, board, background_tasks) for chapter in _iter_accessible_chapters(db, user)]


@router.get("/chapters/{chapter_id}/topics", response_model=ChapterTopicsOut)
def list_chapter_topics(
    chapter_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Topic index for a chapter — click a topic to open individual notes."""
    chapter = _load_chapter_for_notes(db, chapter_id, user)
    board = _user_board(user)
    note = chapter.study_notes
    if notes_need_regeneration(note) or is_generating_study_notes(chapter.id):
        if not is_generating_study_notes(chapter.id):
            background_tasks.add_task(ensure_chapter_study_notes, chapter.id, board=board, force=False)
        return ChapterTopicsOut(
            chapter_id=chapter.id,
            chapter_title=chapter.title,
            subject=chapter.book.subject if chapter.book else "",
            class_grade=chapter.book.class_grade if chapter.book else 0,
            board=board,
            status="generating",
            overview="Topics are being prepared from your uploaded chapter content…",
            topics=[],
            lecture_id=_first_lecture_id(chapter),
        )

    payload = _parse_study_payload(note.content_json)
    return ChapterTopicsOut(
        chapter_id=chapter.id,
        chapter_title=chapter.title,
        subject=note.subject or (chapter.book.subject if chapter.book else ""),
        class_grade=note.class_grade or (chapter.book.class_grade if chapter.book else 0),
        board=note.board or board,
        status=note.status,
        overview=str(payload.get("overview") or ""),
        topics=_topic_summaries_from_payload(payload),
        lecture_id=_first_lecture_id(chapter),
    )


@router.get("/chapters/{chapter_id}/topics/{topic_index}", response_model=TopicDetailOut)
def get_chapter_topic_detail(
    chapter_id: int,
    topic_index: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Single topic notes page."""
    chapter = _load_chapter_for_notes(db, chapter_id, user)
    board = _user_board(user)
    note = chapter.study_notes
    if notes_need_regeneration(note) or is_generating_study_notes(chapter.id):
        if not is_generating_study_notes(chapter.id):
            background_tasks.add_task(ensure_chapter_study_notes, chapter.id, board=board, force=False)
        raise HTTPException(status_code=404, detail="Notes are still generating. Open the chapter again in a minute.")

    payload = _parse_study_payload(note.content_json)
    topics_raw = payload.get("topics") if isinstance(payload.get("topics"), list) else []
    if topic_index < 0 or topic_index >= len(topics_raw) or not isinstance(topics_raw[topic_index], dict):
        raise HTTPException(status_code=404, detail="Topic not found")

    return TopicDetailOut(
        chapter_id=chapter.id,
        chapter_title=chapter.title,
        subject=note.subject or (chapter.book.subject if chapter.book else ""),
        class_grade=note.class_grade or (chapter.book.class_grade if chapter.book else 0),
        board=note.board or board,
        topic_index=topic_index,
        topic_count=len(topics_raw),
        prev_index=topic_index - 1 if topic_index > 0 else None,
        next_index=topic_index + 1 if topic_index + 1 < len(topics_raw) else None,
        topic=_study_topic_from_raw(topics_raw[topic_index]),
    )


@router.get("/chapters/{chapter_id}", response_model=StudyNoteDetailOut)
def get_complete_chapter_notes(
    chapter_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    chapter = _load_chapter_for_notes(db, chapter_id, user)
    board = _user_board(user)
    note = chapter.study_notes
    if notes_need_regeneration(note) or is_generating_study_notes(chapter.id):
        if not is_generating_study_notes(chapter.id):
            background_tasks.add_task(ensure_chapter_study_notes, chapter.id, board=board, force=False)
        return StudyNoteDetailOut(
            chapter_id=chapter.id,
            title=f"{chapter.title} · Detailed notes",
            chapter_title=chapter.title,
            subject=chapter.book.subject if chapter.book else "",
            class_grade=chapter.book.class_grade if chapter.book else 0,
            board=board,
            status="generating",
            overview="Detailed notes with examples and solved questions are being prepared. Refresh in a minute.",
            topics=[],
            lecture_id=_first_lecture_id(chapter),
        )

    payload = _parse_study_payload(note.content_json)
    topics_raw = payload.get("topics") if isinstance(payload.get("topics"), list) else []
    topics = [_study_topic_from_raw(item) for item in topics_raw if isinstance(item, dict)]

    return StudyNoteDetailOut(
        chapter_id=chapter.id,
        title=note.title or f"{chapter.title} · Detailed notes",
        chapter_title=chapter.title,
        subject=note.subject or (chapter.book.subject if chapter.book else ""),
        class_grade=note.class_grade or (chapter.book.class_grade if chapter.book else 0),
        board=note.board or board,
        status=note.status,
        overview=str(payload.get("overview") or ""),
        topics=topics,
        questions_with_answers=list(payload.get("questions_with_answers") or []),
        revision_sheet=list(payload.get("revision_sheet") or []),
        important_questions=list(payload.get("important_questions") or []),
        exam_tips=list(payload.get("exam_tips") or []),
        lecture_id=_first_lecture_id(chapter),
    )


@router.get("/lectures/{lecture_id}", response_model=LectureSyncedNoteOut)
def get_lecture_synced_notes(
    lecture_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    """Timed notes used during classroom playback (audio sync)."""
    lecture = (
        db.query(LecturePart)
        .options(
            joinedload(LecturePart.chapter).joinedload(Chapter.book),
            joinedload(LecturePart.visual_frames),
        )
        .filter(LecturePart.id == lecture_id)
        .first()
    )
    if not lecture or not _lecture_accessible(lecture, user):
        raise HTTPException(status_code=404, detail="Lecture notes not found")

    note_frames = sorted(
        [f for f in (lecture.visual_frames or []) if (f.source_type or "") == "notes"],
        key=lambda f: f.frame_number,
    )
    if not note_frames:
        raise HTTPException(status_code=404, detail="Synced notes not ready for this lecture yet")

    book = lecture.chapter.book
    pages: list[NotePageOut] = []
    for frame in note_frames:
        payload = _parse_notes_payload(frame.segment_text)
        pages.append(
            NotePageOut(
                page_number=frame.frame_number,
                title=str(payload.get("title") or frame.caption or f"Page {frame.frame_number}"),
                summary=str(payload.get("summary") or ""),
                transcript=str(payload.get("transcript") or ""),
                lines=list(payload.get("lines") or []),
                sections=list(payload.get("sections") or []),
                key_points=list(payload.get("key_points") or []),
                practice=list(payload.get("practice") or []),
                start_seconds=frame.start_seconds,
                duration_seconds=frame.duration_seconds,
            )
        )

    return LectureSyncedNoteOut(
        lecture_id=lecture.id,
        chapter_id=lecture.chapter_id,
        title=lecture.title,
        chapter_title=lecture.chapter.title,
        subject=book.subject if book else "",
        class_grade=book.class_grade if book else 0,
        board=_user_board(user),
        pages=pages,
    )


# Backward-compatible alias used by older frontend paths.
@router.get("/{lecture_id}", response_model=LectureSyncedNoteOut)
def get_notes_legacy_lecture_path(
    lecture_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("lectures")),
):
    return get_lecture_synced_notes(lecture_id, db=db, user=user)
