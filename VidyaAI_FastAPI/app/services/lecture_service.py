import logging
import re
from dataclasses import dataclass

from openai import OpenAI
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import SessionLocal
from app.models.book import Chapter, ChapterStatus, LecturePart, LectureStatus, LectureVisualFrame
from app.services.prompts import (
    LECTURE_CONTINUE_PROMPT,
    LECTURE_SYSTEM_PROMPT,
    build_lecture_user_prompt,
)
from app.services.storage_service import write_bytes, write_from_temp_file
from app.services.tts_service import generate_audio_with_timeline
from app.utils.media_paths import lecture_audio_key
from app.utils.storage_scope import scope_for_book
from app.services.visual_frame_builder import build_lecture_visual_frames
from app.utils.chapter_labels import chapter_display_label

logger = logging.getLogger(__name__)


def estimate_minutes(word_count: int) -> float:
    return round(word_count / settings.words_per_minute, 1)


def target_word_count(minutes: float) -> int:
    return int(minutes * settings.words_per_minute)


def split_content_into_parts(content: str, max_words: int) -> list[str]:
    """Split long chapter text into lecture-sized chunks at paragraph boundaries."""
    paragraphs = [part.strip() for part in content.split("\n\n") if part.strip()]
    if not paragraphs:
        return [content]

    parts: list[str] = []
    current: list[str] = []
    word_count = 0

    for paragraph in paragraphs:
        paragraph_words = len(paragraph.split())
        if word_count + paragraph_words > max_words and current:
            parts.append("\n\n".join(current))
            current = [paragraph]
            word_count = paragraph_words
        else:
            current.append(paragraph)
            word_count += paragraph_words

    if current:
        parts.append("\n\n".join(current))

    if len(parts) == 1 and len(parts[0].split()) > max_words * 1.2:
        sentences = re.split(r"(?<=[.!?])\s+", parts[0])
        parts = []
        current = []
        word_count = 0
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            sentence_words = len(sentence.split())
            if word_count + sentence_words > max_words and current:
                parts.append(" ".join(current))
                current = [sentence]
                word_count = sentence_words
            else:
                current.append(sentence)
                word_count += sentence_words
        if current:
            parts.append(" ".join(current))

    return parts or [content]


def build_lecture_plans(chapter_number: int, chapter_title: str, content: str) -> list[dict]:
    """Split chapter content into lecture parts capped at target_lecture_minutes (default 40 min)."""
    target_minutes = float(settings.target_lecture_minutes)
    max_words = target_word_count(target_minutes)
    content_words = len((content or "").split())
    label = chapter_display_label(chapter_number, chapter_title)

    if content_words <= max_words:
        return [
            {
                "part_number": 1,
                "title": label,
                "target_minutes": target_minutes,
                "word_budget": max_words,
                "content_slice": content,
            }
        ]

    slices = split_content_into_parts(content, max_words)
    plans: list[dict] = []
    for index, slice_content in enumerate(slices, start=1):
        plans.append(
            {
                "part_number": index,
                "title": f"{label} — Part {index}",
                "target_minutes": target_minutes,
                "word_budget": max_words,
                "content_slice": slice_content,
            }
        )
    return plans


def build_single_lecture_plan(chapter_number: int, chapter_title: str, content: str) -> dict:
    return build_lecture_plans(chapter_number, chapter_title, content)[0]


def get_openai_client() -> OpenAI:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def generate_lecture_script(
    *,
    class_grade: int,
    subject: str,
    chapter_title: str,
    content: str,
    target_minutes: float,
    system_prompt: str | None = None,
    content_language: str | None = None,
    lecture_language: str | None = None,
    lecture_persona: str | None = None,
) -> dict:
    client = get_openai_client()
    word_budget = target_word_count(target_minutes)
    max_words = word_budget
    min_words = max(int(max_words * 0.6), 400)

    source_content = content[:50000]
    resolved_language = lecture_language or content_language
    prompt = build_lecture_user_prompt(
        class_grade=class_grade,
        subject=subject,
        chapter_title=chapter_title,
        content=source_content,
        target_minutes=target_minutes,
        word_budget=word_budget,
        content_language=content_language,
        lecture_language=lecture_language,
        lecture_persona=lecture_persona,
    )

    lecture_system = system_prompt or LECTURE_SYSTEM_PROMPT
    messages: list[dict[str, str]] = [
        {"role": "system", "content": lecture_system},
        {"role": "user", "content": prompt},
    ]

    script_parts: list[str] = []
    for attempt in range(settings.lecture_max_continuations):
        response = client.chat.completions.create(
            model=settings.lecture_model,
            messages=messages,
            temperature=0.7,
            max_tokens=settings.lecture_max_tokens,
        )
        chunk = (response.choices[0].message.content or "").strip()
        if chunk:
            script_parts.append(chunk)

        script = "\n\n".join(script_parts)
        word_count = len(script.split())
        if word_count >= min_words or word_count >= max_words:
            break

        if attempt + 1 >= settings.lecture_max_continuations:
            break

        messages.append({"role": "assistant", "content": chunk})
        messages.append({"role": "user", "content": LECTURE_CONTINUE_PROMPT})
        logger.info(
            "Lecture continuation %s/%s for %r (%s words so far)",
            attempt + 2,
            settings.lecture_max_continuations,
            chapter_title,
            word_count,
        )

    script = "\n\n".join(script_parts)
    words = script.split()
    if len(words) > max_words:
        script = " ".join(words[:max_words])
    word_count = len(script.split())

    summary_response = client.chat.completions.create(
        model=settings.lecture_model,
        messages=[
            {
                "role": "system",
                "content": "Write short, simple recap notes for young students.",
            },
            {
                "role": "user",
                "content": (
                    "In 4–5 very simple sentences, list what a beginner student learned "
                    "(for tomorrow's recap). Use easy words only:\n\n"
                    f"{script[:5000]}"
                ),
            },
        ],
        temperature=0.3,
        max_tokens=400,
    )
    summary = summary_response.choices[0].message.content or ""

    return {
        "script": script,
        "summary": summary,
        "word_count": word_count,
        "duration_minutes": estimate_minutes(word_count),
    }


@dataclass
class _ChapterSnapshot:
    id: int
    title: str
    chapter_number: int
    content: str
    class_grade: int
    subject: str
    book_id: int


def _load_chapter_snapshot(chapter_id: int) -> _ChapterSnapshot:
    db = SessionLocal()
    try:
        chapter = (
            db.query(Chapter)
            .options(joinedload(Chapter.book))
            .filter(Chapter.id == chapter_id)
            .first()
        )
        if not chapter or not chapter.content:
            raise ValueError("Chapter not found or has no content")

        for lp in db.query(LecturePart).filter(LecturePart.chapter_id == chapter_id).all():
            db.delete(lp)
        chapter.status = ChapterStatus.GENERATING
        db.commit()

        return _ChapterSnapshot(
            id=chapter.id,
            title=chapter.title,
            chapter_number=chapter.chapter_number,
            content=chapter.content,
            class_grade=chapter.book.class_grade,
            subject=chapter.book.subject,
            book_id=chapter.book_id,
        )
    finally:
        db.close()


def _set_chapter_status(chapter_id: int, status: ChapterStatus) -> None:
    db = SessionLocal()
    try:
        chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if chapter:
            chapter.status = status
            db.commit()
    finally:
        db.close()


def generate_lectures_for_chapter_id(
    chapter_id: int,
    *,
    lecture_language: str = "english",
    lecture_persona: str = "warm",
) -> None:
    """
    Generate lecture part(s) for a chapter. Long chapters become Part 1/2/3,
    not separate chapter records.
    """
    try:
        snapshot = _load_chapter_snapshot(chapter_id)
        plans = build_lecture_plans(snapshot.chapter_number, snapshot.title, snapshot.content)
        previous_context: str | None = None

        db_scope = SessionLocal()
        try:
            chapter = (
                db_scope.query(Chapter)
                .options(joinedload(Chapter.book))
                .filter(Chapter.id == chapter_id)
                .first()
            )
            scope = scope_for_book(chapter.book, db_scope) if chapter else None
        finally:
            db_scope.close()

        total_parts = len(plans)
        from app.services.agent_orchestrator import get_subject_agent_for_book

        subject_agent = get_subject_agent_for_book(snapshot.book_id)
        agent_prompt = subject_agent.system_prompt if subject_agent else None
        agent_voice = subject_agent.tts_voice_id if subject_agent else None
        agent_language = subject_agent.content_language if subject_agent else None
        from app.services.prompts import resolve_lecture_language_code
        from app.utils.language import lecture_language_meta

        content_language = resolve_lecture_language_code(lecture_language) or agent_language
        _, language_voice, _ = lecture_language_meta(lecture_language)
        tts_voice = language_voice or agent_voice

        for plan in plans:
            result = generate_lecture_script(
                class_grade=snapshot.class_grade,
                subject=snapshot.subject,
                chapter_title=plan["title"],
                content=plan["content_slice"],
                target_minutes=plan["target_minutes"],
                system_prompt=agent_prompt,
                content_language=content_language,
                lecture_language=lecture_language,
                lecture_persona=lecture_persona,
            )

            audio_path_str: str | None = None
            status = LectureStatus.READY
            db = SessionLocal()
            try:
                lecture = LecturePart(
                    chapter_id=chapter_id,
                    part_number=plan["part_number"],
                    title=plan["title"],
                    script=result["script"],
                    summary=result["summary"],
                    word_count=result["word_count"],
                    duration_minutes=result["duration_minutes"],
                    status=LectureStatus.GENERATING,
                    previous_context=previous_context,
                    lecture_persona=lecture_persona,
                )
                db.add(lecture)
                db.flush()
                lecture_id = lecture.id
                db.commit()
            finally:
                db.close()

            voice_timeline: list[dict] = []
            if scope is not None:
                audio_key = lecture_audio_key(scope, lecture_id)
                try:
                    def _write_synced_audio(path):
                        voice_timeline.extend(
                            generate_audio_with_timeline(
                                result["script"],
                                path,
                                voice_id=tts_voice,
                                persona=lecture_persona,
                            )
                        )

                    audio_path_str = write_from_temp_file(
                        audio_key,
                        _write_synced_audio,
                        content_type="audio/mpeg",
                        suffix=".mp3",
                    )
                except Exception as audio_err:
                    logger.warning("TTS failed for lecture %s: %s", lecture_id, audio_err)
                    voice_timeline.clear()

            try:
                subject_name = snapshot.subject
                frame_data = build_lecture_visual_frames(
                    lecture_part_id=lecture_id,
                    chapter_id=chapter_id,
                    script=result["script"],
                    duration_minutes=result["duration_minutes"],
                    part_number=plan["part_number"],
                    total_parts=total_parts,
                    subject=subject_name,
                    timeline=voice_timeline or None,
                    total_seconds=(
                        sum(float(item.get("duration_seconds") or 0) for item in voice_timeline)
                        if voice_timeline
                        else None
                    ),
                    chapter_title=plan.get("title") or snapshot.subject,
                    class_grade=snapshot.class_grade,
                    lecture_language=lecture_language,
                )
                db = SessionLocal()
                try:
                    for frame in frame_data:
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
                                source_type=frame.get("source_type", "document"),
                            )
                        )
                    db.commit()
                finally:
                    db.close()
            except Exception as visual_err:
                logger.warning("Visual generation failed for lecture %s: %s", lecture_id, visual_err)

            db = SessionLocal()
            try:
                lecture = db.query(LecturePart).filter(LecturePart.id == lecture_id).first()
                if lecture:
                    lecture.audio_path = audio_path_str
                    lecture.status = status
                    db.commit()
            finally:
                db.close()

            previous_context = result["summary"]

        # Complete Notes-section study pack (CBSE/class syllabus), separate from lecture sync notes.
        try:
            from app.services.study_notes_service import ensure_chapter_study_notes

            ensure_chapter_study_notes(chapter_id, board="CBSE", force=False)
        except Exception as study_err:
            logger.warning("Complete study notes failed for chapter %s: %s", chapter_id, study_err)

        # Lectures themselves succeeded — never leave the chapter as Failed for optional post-steps.
        _set_chapter_status(chapter_id, ChapterStatus.READY)
    except Exception as exc:
        logger.exception("Lecture generation failed for chapter %s", chapter_id)
        # If every part already landed as ready, keep chapter usable instead of a sticky Failed badge.
        db = SessionLocal()
        try:
            parts = db.query(LecturePart).filter(LecturePart.chapter_id == chapter_id).all()
            if parts and all(p.status == LectureStatus.READY for p in parts):
                chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
                if chapter:
                    chapter.status = ChapterStatus.READY
                    db.commit()
                    logger.warning(
                        "Chapter %s kept READY because all lecture parts succeeded despite: %s",
                        chapter_id,
                        exc,
                    )
                    return
        finally:
            db.close()
        _set_chapter_status(chapter_id, ChapterStatus.FAILED)
        raise exc
