"""Student support chat grounded strictly on selected chapter material."""

import re
from datetime import datetime

from openai import OpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.book import Book, Chapter, LecturePart
from app.models.support_chat import SupportChatMessage
from app.models.user import User
from app.services.lecture_service import get_openai_client
from app.utils.program_access import book_visible_to_user

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")

SUPPORT_SYSTEM_PROMPT = """You are VidyaAI Support helping a student with their CURRENT selected chapter only.

STRICT CHAPTER RULES:
- Answer ONLY using the CHAPTER MATERIAL provided below for this one chapter.
- Do NOT use outside knowledge, the internet, other chapters, general science facts, or common knowledge.
- If the question is only partly covered, answer only the part that appears in the material and clearly say the rest is not in this chapter.
- If the student's question is not covered by the provided material, reply with the refusal message for their language (see LANGUAGE) and nothing else.
- Keep answers short, simple, and faithful to the source text.
- Do not invent facts, examples, definitions, properties, or comparisons that are not in the provided material.

LANGUAGE RULES:
- Detect the student's language from their latest message.
- If the student wrote in Hindi (Devanagari) OR asked in Hinglish, reply in Hinglish using ONLY English/Latin alphabets.
- Hinglish means natural spoken Indian classroom mix written in roman script, e.g.
  "Metal aur non-metal mein difference yeh hai:" then short bullet points in the same style.
- NEVER use Devanagari script in your reply (no हिंदी letters at all).
- Keep school English words in English (metal, non-metal, conductor, lustre) and connect with simple roman Hindi (mein, aur, hota hai, ke properties).
- If the student wrote in English (Latin only, no Hindi), reply in clear simple English.
- Hinglish refusal (use exactly when material does not cover a Hindi/Hinglish question):
  "Is selected chapter mein is sawal ki jaankari nahi hai. Please isi chapter ke topics se poochho."
- English refusal (use exactly when material does not cover an English question):
  "I don't have information about that in your selected chapter. Please ask about topics covered in this chapter."
"""


def _message_looks_hindi(text: str) -> bool:
    return bool(DEVANAGARI_RE.search(text or ""))


def resolve_support_context(
    db,
    *,
    user: User,
    subject: str | None,
    chapter_id: int | None,
    book_page_number: int | None = None,
) -> tuple[str | None, Chapter | None, str | None]:
    """Return (context_text, chapter, error_message)."""
    subject_clean = (subject or "").strip()
    if not subject_clean:
        return None, None, "Select a subject before asking."
    if not chapter_id:
        return None, None, "Select a chapter before asking."

    chapter = (
        db.query(Chapter)
        .join(Book)
        .filter(
            Chapter.id == chapter_id,
            Book.school_id == user.school_id,
            Book.subject == subject_clean,
        )
        .first()
    )
    if not chapter:
        return None, None, "Chapter not found for the selected subject."
    if not book_visible_to_user(chapter.book, user):
        return None, None, "You do not have access to this chapter."

    parts = (
        db.query(LecturePart)
        .filter(LecturePart.chapter_id == chapter.id)
        .order_by(LecturePart.part_number)
        .all()
    )

    material: list[str] = []
    if chapter.content and chapter.content.strip():
        material.append(f"[Chapter text]\n{chapter.content.strip()[:8000]}")

    try:
        from app.services.vector_service import get_chapter_content_from_vectors

        vector_text = get_chapter_content_from_vectors(
            chapter.book_id,
            title=chapter.title,
            page_start=chapter.pdf_start_page,
            page_end=chapter.pdf_end_page,
            fallback="",
        )
        if vector_text and vector_text.strip():
            material.append(f"[Textbook excerpts for this chapter only]\n{vector_text.strip()[:10000]}")
    except Exception:
        pass

    for part in parts:
        if part.summary and part.summary.strip():
            material.append(f"[Lecture summary — part {part.part_number}]\n{part.summary.strip()}")
        elif part.script and part.script.strip():
            material.append(f"[Lecture script — part {part.part_number}]\n{part.script.strip()[:2000]}")

    if not material:
        return None, None, (
            "No lecture material is available for this chapter yet. "
            "Support opens once your teacher publishes class content for this chapter."
        )

    context = (
        f"Subject: {subject_clean}\n"
        f"Chapter id: {chapter.id}\n"
        f"Chapter {chapter.chapter_number}: {chapter.title}\n"
        f"IMPORTANT: Use ONLY the material below. Ignore anything outside this chapter.\n\n"
        + "\n\n---\n\n".join(material)
    )
    if book_page_number:
        context += f"\n\nStudent is on textbook page {book_page_number}."
    return context, chapter, None


def chat_with_support(*, message: str, chapter_context: str) -> str:
    client = get_openai_client()
    language_hint = (
        "The student asked in Hindi — reply in Hinglish using English alphabets only. "
        "Do NOT use Devanagari. Example style: 'Metal soft hote hain aur unmein metallic lustre hota hai.'"
        if _message_looks_hindi(message)
        else "The student asked in English — reply in simple English."
    )
    messages = [
        {
            "role": "system",
            "content": (
                f"{SUPPORT_SYSTEM_PROMPT}\n\n{language_hint}\n\n"
                f"CHAPTER MATERIAL:\n{chapter_context[:12000]}"
            ),
        },
        {"role": "user", "content": message},
    ]
    response = client.chat.completions.create(
        model=settings.lecture_model,
        messages=messages,
        temperature=0.1,
        max_tokens=800,
    )
    return (response.choices[0].message.content or "").strip()


def save_support_message(
    db: Session,
    *,
    student_id: int,
    chapter_id: int,
    subject: str,
    role: str,
    content: str,
    audio_url: str | None = None,
) -> SupportChatMessage:
    row = SupportChatMessage(
        student_id=student_id,
        chapter_id=chapter_id,
        subject=subject.strip(),
        role=role,
        content=content,
        audio_url=audio_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_support_history(
    db: Session,
    *,
    student_id: int,
    chapter_id: int,
    subject: str,
    limit: int = 100,
) -> list[SupportChatMessage]:
    return (
        db.query(SupportChatMessage)
        .filter(
            SupportChatMessage.student_id == student_id,
            SupportChatMessage.chapter_id == chapter_id,
            SupportChatMessage.subject == subject.strip(),
        )
        .order_by(SupportChatMessage.created_at.asc(), SupportChatMessage.id.asc())
        .limit(limit)
        .all()
    )


def delete_support_history(
    db: Session,
    *,
    student_id: int,
    chapter_id: int,
    subject: str,
) -> int:
    deleted = (
        db.query(SupportChatMessage)
        .filter(
            SupportChatMessage.student_id == student_id,
            SupportChatMessage.chapter_id == chapter_id,
            SupportChatMessage.subject == subject.strip(),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


def list_support_sessions(
    db: Session,
    *,
    student_id: int,
    limit: int = 30,
) -> list[dict]:
    """Recent chapter conversations for this student (one row per chapter)."""
    latest_subq = (
        db.query(
            SupportChatMessage.chapter_id.label("chapter_id"),
            SupportChatMessage.subject.label("subject"),
            func.max(SupportChatMessage.id).label("last_id"),
        )
        .filter(SupportChatMessage.student_id == student_id)
        .group_by(SupportChatMessage.chapter_id, SupportChatMessage.subject)
        .subquery()
    )

    rows = (
        db.query(SupportChatMessage, Chapter)
        .join(latest_subq, SupportChatMessage.id == latest_subq.c.last_id)
        .outerjoin(Chapter, Chapter.id == SupportChatMessage.chapter_id)
        .order_by(SupportChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )

    sessions: list[dict] = []
    for msg, chapter in rows:
        sessions.append(
            {
                "chapter_id": msg.chapter_id,
                "subject": msg.subject,
                "chapter_title": chapter.title if chapter else f"Chapter {msg.chapter_id}",
                "chapter_number": chapter.chapter_number if chapter else None,
                "last_message": (msg.content or "")[:160],
                "last_role": msg.role,
                "updated_at": msg.created_at.isoformat() if isinstance(msg.created_at, datetime) else str(msg.created_at),
            }
        )
    return sessions


def transcribe_support_audio(client: OpenAI, file_bytes: bytes, *, filename: str, content_type: str) -> str:
    if len(file_bytes) < 1000:
        raise ValueError("Recording too short. Hold the microphone a little longer and try again.")

    transcript_resp = client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, file_bytes, content_type or "audio/webm"),
    )
    transcript = (transcript_resp.text or "").strip()
    if not transcript:
        raise ValueError("Could not understand the audio. Please try again.")
    return transcript
