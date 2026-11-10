import logging

from app.services.notes_service import generate_note_frames_from_timeline
from app.services.visual_service import segment_timings, split_script_into_segments

logger = logging.getLogger(__name__)


def build_lecture_visual_frames(
    *,
    lecture_part_id: int,
    chapter_id: int,
    script: str,
    duration_minutes: float,
    part_number: int = 1,
    total_parts: int = 1,
    subject: str | None = None,
    timeline: list[dict] | None = None,
    total_seconds: float | None = None,
    chapter_title: str | None = None,
    class_grade: int | None = None,
    lecture_language: str | None = None,
) -> list[dict]:
    """
    Build lecture study-note pages (replaces board / PDF page context).

    Prefer `timeline` from generate_audio_with_timeline so notes and voice
    share the same teaching segments and timings.
    """
    del part_number, total_parts, chapter_id  # unused — notes are timeline-driven

    subject_name = (subject or "General").strip() or "General"
    chapter_name = (chapter_title or "Chapter").strip() or "Chapter"

    timed = list(timeline or [])
    if not timed:
        segments = split_script_into_segments(script)
        if not segments:
            segments = [(script or "Class notes")[:800]]
        total = float(total_seconds) if total_seconds and total_seconds > 0 else max(duration_minutes * 60, len(segments) * 8)
        timings = segment_timings(segments, total)
        timed = [
            {
                "text": segment,
                "start_seconds": start,
                "duration_seconds": dur,
            }
            for segment, (start, dur) in zip(segments, timings)
        ]

    frames = generate_note_frames_from_timeline(
        timeline=timed,
        subject=subject_name,
        chapter_title=chapter_name,
        class_grade=class_grade,
        lecture_language=lecture_language,
    )
    if frames:
        logger.info("Using %s note page(s) for lecture %s", len(frames), lecture_part_id)
    else:
        logger.warning("No note pages for lecture %s", lecture_part_id)
    return frames
