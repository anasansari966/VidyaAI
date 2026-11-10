import logging

from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.book import Chapter, LecturePart, LectureVisualFrame
from app.services.image_migration_service import delete_image_file
from app.services.storage_service import read_bytes
from app.services.visual_frame_builder import build_lecture_visual_frames
from app.services.visual_service import segment_timings, split_script_into_segments
from app.utils.mp3_duration import mp3_duration_seconds

logger = logging.getLogger(__name__)

_generating_visuals: set[int] = set()


def is_generating_visuals(lecture_id: int) -> bool:
    return lecture_id in _generating_visuals


def _timeline_from_audio(script: str, audio_path: str | None, duration_minutes: float) -> list[dict] | None:
    spoken_segments = split_script_into_segments(script or "")
    if not spoken_segments:
        return None

    total = 0.0
    if audio_path:
        try:
            total = mp3_duration_seconds(read_bytes(audio_path))
        except Exception:
            total = 0.0
    if total <= 0:
        total = max(duration_minutes * 60, len(spoken_segments) * 8)

    timings = segment_timings(spoken_segments, total)
    return [
        {
            "text": text,
            "start_seconds": round(start, 2),
            "duration_seconds": round(dur, 2),
        }
        for text, (start, dur) in zip(spoken_segments, timings)
    ]


def regenerate_visuals_for_lecture_id(lecture_id: int) -> int:
    """Generate synced study-note pages for a lecture. Returns number of pages created."""
    if lecture_id in _generating_visuals:
        return 0

    _generating_visuals.add(lecture_id)
    created = 0

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
                return 0

            book = lecture.chapter.book
            subject_name = book.subject if book else None

            for frame in list(lecture.visual_frames):
                if frame.image_path:
                    delete_image_file(frame.image_path)
                db.delete(frame)
            db.commit()

            total_parts = (
                db.query(LecturePart)
                .filter(LecturePart.chapter_id == lecture.chapter_id)
                .count()
            )

            timeline = _timeline_from_audio(
                lecture.script,
                lecture.audio_path,
                lecture.duration_minutes,
            )
            total_seconds = sum(float(item["duration_seconds"]) for item in timeline) if timeline else None

            frame_data = build_lecture_visual_frames(
                lecture_part_id=lecture_id,
                chapter_id=lecture.chapter_id,
                script=lecture.script,
                duration_minutes=lecture.duration_minutes,
                part_number=lecture.part_number,
                total_parts=max(total_parts, 1),
                subject=subject_name,
                timeline=timeline,
                total_seconds=total_seconds,
                chapter_title=lecture.chapter.title if lecture.chapter else lecture.title,
                class_grade=book.class_grade if book else None,
            )

            for frame in frame_data:
                caption = (frame.get("caption") or "")[:480]
                db.add(
                    LectureVisualFrame(
                        lecture_part_id=lecture_id,
                        frame_number=frame["frame_number"],
                        caption=caption,
                        segment_text=frame["segment_text"],
                        image_path=frame["image_path"],
                        start_seconds=frame["start_seconds"],
                        duration_seconds=frame["duration_seconds"],
                        book_page_number=frame.get("book_page_number"),
                        source_type=frame.get("source_type", "notes"),
                    )
                )
            db.commit()
            created = len(frame_data)
            logger.info("Created %s note page(s) for lecture %s", created, lecture_id)
            return created
        finally:
            db.close()
    finally:
        _generating_visuals.discard(lecture_id)
