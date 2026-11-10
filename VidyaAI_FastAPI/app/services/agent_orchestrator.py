"""Multi-agent orchestration: chapter index, subject expert, language-aware teaching."""

import json
import logging
import re
from typing import Any

from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.book import Book
from app.models.subject_agent import SubjectAgent
from app.services.vector_service import get_chapter_content_from_vectors, search_book_chunks
from app.utils.chapter_labels import clean_chapter_title
from app.utils.document_parser import enrich_chapter_content
from app.utils.language import detect_content_language  # noqa: F401 — re-exported for callers
from app.utils.text_sanitize import sanitize_db_text

logger = logging.getLogger(__name__)


def _get_client() -> OpenAI:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def _parse_json_array(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            try:
                data = json.loads(match.group(0))
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
                return []
    return []


def _heuristic_is_complete(chapters: list[dict[str, Any]]) -> bool:
    if len(chapters) < 3:
        return False
    titled = [ch for ch in chapters if (ch.get("title") or "").strip() and ch.get("title") != "Full Book"]
    return len(titled) >= 3


def _build_subject_teacher_profile(
    *,
    subject: str,
    class_grade: int,
    language_label: str,
    content_language: str,
) -> tuple[str, str, str]:
    subject_lower = subject.lower()
    is_math = any(word in subject_lower for word in ("math", "mathematics", "गणित"))
    is_language = any(
        word in subject_lower
        for word in ("hindi", "sanskrit", "urdu", "marathi", "french", "français", "francais")
    )
    is_native_script = content_language.startswith(("hi", "ur", "sa", "mr", "fr"))

    if is_math:
        system_prompt = (
            f"You are a beloved Class {class_grade} Mathematics teacher with 25 years of experience in Indian schools. "
            "Teach on the board step by step, show every calculation, check common mistakes, and use daily-life examples. "
            "Sound like a real teacher in front of the class — patient, clear, and encouraging. "
            "IMPORTANT for the digital board: put each formula, equation, and numbered step on its own short line "
            "(for example: Step 1: … then ax² + bx + c = 0 on the next line). "
            "Do not bury equations inside long paragraphs."
        )
        style = "step-by-step-math"
        notes = "Board-style worked examples; pause after each step; equations on separate lines."
    elif is_language or is_native_script:
        system_prompt = (
            f"You are a master Class {class_grade} {subject} teacher with 25 years in Indian classrooms. "
            f"Teach entirely in {language_label}. Use simple spoken language, stories, and repetition. "
            "Never switch to English unless a term has no equivalent. "
            f"Keep the correct script for {language_label} (Devanagari / Arabic / Latin as appropriate)."
        )
        style = "language-immersion"
        notes = f"Voice and script in {language_label}."
    elif "science" in subject_lower or "physics" in subject_lower or "chemistry" in subject_lower:
        system_prompt = (
            f"You are an experienced Class {class_grade} {subject} teacher in India. "
            "Use NCERT clarity, home experiments, and real-world examples. "
            "Build concepts from easy to hard like a live lab + classroom session."
        )
        style = "demo-classroom"
        notes = "Daily-life demos and simple definitions first."
    else:
        system_prompt = (
            f"You are a warm Class {class_grade} {subject} teacher with 25 years of experience. "
            f"Teach in {language_label} with stories, questions, and encouragement — like a real school period."
        )
        style = "classroom"
        notes = "Conversational Indian classroom tone."

    return system_prompt, style, notes


def extract_chapters_with_agents(
    *,
    subject: str,
    class_grade: int,
    heuristic_chapters: list[dict[str, Any]],
    toc_snippet: str,
    classification_text: str,
) -> list[dict[str, Any]]:
    """Find every chapter — heuristics first; AI sees TOC/front matter only."""
    if _heuristic_is_complete(heuristic_chapters):
        ordered = sorted(heuristic_chapters, key=lambda ch: int(ch.get("chapter_number") or 0))
        return enrich_chapter_content(classification_text, ordered)

    heuristic_json = json.dumps(
        [
            {
                "chapter_number": ch.get("chapter_number"),
                "title": ch.get("title"),
                "pdf_start_page": ch.get("pdf_start_page"),
                "pdf_end_page": ch.get("pdf_end_page"),
            }
            for ch in heuristic_chapters[:40]
        ],
        ensure_ascii=False,
    )

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.classification_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You read Indian school textbook tables of contents. "
                    "List every chapter in order — never skip. "
                    'Return ONLY JSON: [{"chapter_number":1,"title":"...","pdf_start_page":12,"pdf_end_page":28}]'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Subject: {subject} | Class: {class_grade}\n\n"
                    f"Draft list:\n{heuristic_json}\n\n"
                    f"Table of contents / opening pages:\n{toc_snippet}\n\n"
                    "Return the complete chapter list with page numbers when visible."
                ),
            },
        ],
        temperature=0.1,
        max_tokens=1200,
    )
    ai_chapters = _parse_json_array(response.choices[0].message.content or "")

    merged: dict[int, dict[str, Any]] = {}
    for ch in heuristic_chapters:
        num = int(ch.get("chapter_number") or 0)
        if num >= 0:
            merged[num] = dict(ch)

    for ch in ai_chapters:
        try:
            num = int(ch.get("chapter_number"))
        except (TypeError, ValueError):
            continue
        title = clean_chapter_title(num, str(ch.get("title") or f"Chapter {num}"))
        if not title:
            continue
        existing = merged.get(num, {})
        merged[num] = {
            "chapter_number": num,
            "source_chapter_number": num,
            "title": title,
            "pdf_start_page": ch.get("pdf_start_page") or existing.get("pdf_start_page"),
            "pdf_end_page": ch.get("pdf_end_page") or existing.get("pdf_end_page"),
            "content": existing.get("content") or "",
        }

    ordered = [merged[key] for key in sorted(merged.keys())]
    if not ordered:
        ordered = heuristic_chapters

    return enrich_chapter_content(classification_text, ordered)


def create_subject_expert_agent(
    book_id: int,
    *,
    subject: str,
    class_grade: int,
    content_language: str,
    language_label: str,
    tts_voice_id: str,
    sample_text: str = "",
) -> SubjectAgent:
    """Instant subject teacher profile — tuned for the uploaded subject and language."""
    system_prompt, teaching_style, expertise_notes = _build_subject_teacher_profile(
        subject=subject,
        class_grade=class_grade,
        language_label=language_label,
        content_language=content_language,
    )

    db = SessionLocal()
    try:
        db.query(SubjectAgent).filter(SubjectAgent.book_id == book_id).delete()
        agent = SubjectAgent(
            book_id=book_id,
            subject=subject,
            content_language=content_language,
            teaching_style=teaching_style,
            system_prompt=system_prompt,
            tts_voice_id=tts_voice_id,
            expertise_notes=expertise_notes,
        )
        db.add(agent)
        book = db.query(Book).filter(Book.id == book_id).first()
        if book:
            book.content_language = content_language
        db.commit()
        db.refresh(agent)
        return agent
    finally:
        db.close()


def get_subject_agent_for_book(book_id: int) -> SubjectAgent | None:
    db = SessionLocal()
    try:
        return db.query(SubjectAgent).filter(SubjectAgent.book_id == book_id).first()
    finally:
        db.close()


def get_subject_agent_for_chapter(chapter_id: int) -> SubjectAgent | None:
    db = SessionLocal()
    try:
        from app.models.book import Chapter

        chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
        if not chapter:
            return None
        return db.query(SubjectAgent).filter(SubjectAgent.book_id == chapter.book_id).first()
    finally:
        db.close()
