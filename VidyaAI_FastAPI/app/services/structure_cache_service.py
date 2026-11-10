"""Cache book chapter structure by file hash for instant re-uploads."""

import json
import logging
from typing import Any

from app.database import SessionLocal
from app.models.book import Book, BookStatus, Chapter, ChapterStatus
from app.models.book_structure_cache import BookStructureCache
from app.models.subject_agent import SubjectAgent
from app.utils.text_sanitize import sanitize_db_text

logger = logging.getLogger(__name__)


def get_cached_structure(file_hash: str) -> BookStructureCache | None:
    if not file_hash:
        return None
    db = SessionLocal()
    try:
        return db.query(BookStructureCache).filter(BookStructureCache.file_hash == file_hash).first()
    finally:
        db.close()


def apply_cached_structure(book_id: int, cache: BookStructureCache) -> int:
    """Restore chapters + teacher profile from cache — typically under 2 seconds."""
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            return 0

        chapters = cache.chapters()
        db.query(Chapter).filter(Chapter.book_id == book_id).delete()
        db.query(SubjectAgent).filter(SubjectAgent.book_id == book_id).delete()

        for ch in chapters:
            db.add(
                Chapter(
                    book_id=book.id,
                    chapter_number=int(ch.get("chapter_number") or 0),
                    title=sanitize_db_text(ch.get("title") or "") or "Chapter",
                    content=sanitize_db_text(ch.get("content") or "") or "",
                    status=ChapterStatus.CLASSIFIED,
                    pdf_start_page=ch.get("pdf_start_page"),
                    pdf_end_page=ch.get("pdf_end_page"),
                    source_file_path=book.file_path,
                    source_file_type=book.file_type,
                    source_chapter_number=int(ch.get("chapter_number") or 0) or None,
                )
            )

        if cache.agent_system_prompt:
            db.add(
                SubjectAgent(
                    book_id=book.id,
                    subject=cache.agent_subject or book.subject,
                    content_language=cache.content_language or "en-IN",
                    teaching_style=cache.agent_teaching_style or "classroom",
                    system_prompt=cache.agent_system_prompt,
                    tts_voice_id=cache.agent_tts_voice_id or "Kajal",
                    expertise_notes=cache.agent_expertise_notes,
                )
            )

        book.total_pdf_pages = cache.total_pdf_pages
        book.content_language = cache.content_language
        book.status = BookStatus.READY
        book.processing_progress = 100
        book.processing_message = "Your book is ready!"
        book.file_hash = cache.file_hash

        cache.hit_count = (cache.hit_count or 0) + 1
        db.commit()
        logger.info("Applied structure cache for book %s (hash %s…)", book_id, cache.file_hash[:12])
        return len(chapters)
    finally:
        db.close()


def save_structure_cache(
    file_hash: str,
    *,
    chapters: list[dict[str, Any]],
    total_pdf_pages: int | None,
    content_language: str | None,
    subject: str,
    system_prompt: str,
    teaching_style: str,
    tts_voice_id: str,
    expertise_notes: str | None,
) -> None:
    if not file_hash:
        return
    db = SessionLocal()
    try:
        serializable = [
            {
                "chapter_number": ch.get("chapter_number"),
                "title": ch.get("title"),
                "content": (ch.get("content") or "")[:50000],
                "pdf_start_page": ch.get("pdf_start_page"),
                "pdf_end_page": ch.get("pdf_end_page"),
            }
            for ch in chapters
        ]
        cache = db.query(BookStructureCache).filter(BookStructureCache.file_hash == file_hash).first()
        if not cache:
            cache = BookStructureCache(file_hash=file_hash)
            db.add(cache)
        cache.set_chapters(serializable)
        cache.total_pdf_pages = total_pdf_pages
        cache.content_language = content_language
        cache.agent_subject = subject
        cache.agent_system_prompt = system_prompt
        cache.agent_teaching_style = teaching_style
        cache.agent_tts_voice_id = tts_voice_id
        cache.agent_expertise_notes = expertise_notes
        db.commit()
    finally:
        db.close()
