import logging
import time

from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.book import Chapter, LecturePart, LectureVisualFrame
from app.services.image_migration_service import delete_image_file
from app.services.notes_service import generate_note_frames_from_timeline
from app.services.storage_service import write_from_temp_file
from app.services.tts_service import count_polly_chunks, generate_audio_with_timeline
from app.utils.language import lecture_language_from_content_code
from app.utils.media_paths import lecture_audio_key
from app.utils.storage_scope import scope_for_book

logger = logging.getLogger(__name__)

_generating_audio: set[int] = set()
_audio_failed_at: dict[int, float] = {}
_audio_progress: dict[int, dict[str, int]] = {}
_RETRY_COOLDOWN_SECONDS = 120


def is_generating_audio(lecture_id: int) -> bool:
    return lecture_id in _generating_audio


def should_retry_audio(lecture_id: int) -> bool:
    failed_at = _audio_failed_at.get(lecture_id)
    if failed_at is None:
        return True
    return (time.time() - failed_at) >= _RETRY_COOLDOWN_SECONDS


def get_audio_error(lecture_id: int) -> str | None:
    failed_at = _audio_failed_at.get(lecture_id)
    if failed_at is None:
        return None
    if should_retry_audio(lecture_id):
        return None
    return "Audio generation failed. Please wait a moment, then refresh the page."


def get_audio_progress(lecture_id: int) -> dict[str, int] | None:
    return _audio_progress.get(lecture_id)


def regenerate_audio_for_lecture_id(lecture_id: int) -> bool:
    """Generate missing TTS audio for a lecture that already has a script."""
    if lecture_id in _generating_audio:
        return False
    if not should_retry_audio(lecture_id):
        return False

    _generating_audio.add(lecture_id)
    try:
        db = SessionLocal()
        try:
            lecture = (
                db.query(LecturePart)
                .options(
                    joinedload(LecturePart.visual_frames),
                    joinedload(LecturePart.chapter).joinedload(Chapter.book),
                )
                .filter(LecturePart.id == lecture_id)
                .first()
            )
            if not lecture or not lecture.script:
                return False

            scope = scope_for_book(lecture.chapter.book, db)
            from app.services.agent_orchestrator import get_subject_agent_for_chapter

            subject_agent = get_subject_agent_for_chapter(lecture.chapter_id)
            agent_voice = subject_agent.tts_voice_id if subject_agent else None
            total_chunks = count_polly_chunks(lecture.script)
            _audio_progress[lecture_id] = {"completed": 0, "total": total_chunks}
            audio_key = lecture_audio_key(scope, lecture_id)
            voice_timeline: list[dict] = []

            def on_chunk(completed: int, total: int) -> None:
                _audio_progress[lecture_id] = {"completed": completed, "total": total}

            def _write_synced_audio(path) -> None:
                voice_timeline.extend(
                    generate_audio_with_timeline(
                        lecture.script,
                        path,
                        voice_id=agent_voice,
                        persona=lecture.lecture_persona or "warm",
                        on_chunk=on_chunk,
                    )
                )

            stored_ref = write_from_temp_file(
                audio_key,
                _write_synced_audio,
                content_type="audio/mpeg",
                suffix=".mp3",
            )
            lecture.audio_path = stored_ref
            db.commit()
            _audio_failed_at.pop(lecture_id, None)
            logger.info("Regenerated audio for lecture %s", lecture_id)

            if voice_timeline:
                try:
                    book = lecture.chapter.book if lecture.chapter else None
                    for frame in list(lecture.visual_frames):
                        if frame.image_path:
                            delete_image_file(frame.image_path)
                        db.delete(frame)
                    db.flush()
                    frames = generate_note_frames_from_timeline(
                        timeline=voice_timeline,
                        subject=(book.subject if book else "General"),
                        chapter_title=lecture.chapter.title if lecture.chapter else lecture.title,
                        class_grade=book.class_grade if book else None,
                        lecture_language=lecture_language_from_content_code(
                            getattr(book, "content_language", None) if book else None,
                            book.subject if book else None,
                        ),
                    )
                    for frame in frames:
                        db.add(
                            LectureVisualFrame(
                                lecture_part_id=lecture_id,
                                frame_number=frame["frame_number"],
                                caption=(frame.get("caption") or "")[:480],
                                segment_text=frame["segment_text"],
                                image_path=frame["image_path"],
                                start_seconds=frame["start_seconds"],
                                duration_seconds=frame["duration_seconds"],
                                book_page_number=frame.get("book_page_number"),
                                source_type=frame.get("source_type", "notes"),
                            )
                        )
                    db.commit()
                    logger.info("Resynced note pages with voice timeline for lecture %s", lecture_id)
                except Exception as visual_err:
                    logger.warning("Notes resync after audio regen failed for %s: %s", lecture_id, visual_err)

            return True
        finally:
            db.close()
    except Exception as exc:
        _audio_failed_at[lecture_id] = time.time()
        logger.warning("Audio regeneration failed for lecture %s: %s", lecture_id, exc)
        return False
    finally:
        _generating_audio.discard(lecture_id)
        _audio_progress.pop(lecture_id, None)
