"""Complete CBSE (board) class/standard study notes for the Notes section."""

from __future__ import annotations

import json
import logging
import re
from contextvars import ContextVar
from datetime import datetime
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models.book import Chapter, ChapterStudyNote
from app.services.page_extraction_service import get_chapter_pages
from app.utils.language import lecture_language_from_content_code, maybe_hinglish, notes_language_rules

logger = logging.getLogger(__name__)

_MATH_ALIASES = ("math", "maths", "mathematics", "गणित")
_GENERATING: set[int] = set()
NOTES_SCHEMA_VERSION = 3
_LECTURE_LANGUAGE: ContextVar[str | None] = ContextVar("study_notes_lecture_language", default=None)


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def _is_math(subject: str) -> bool:
    text = (subject or "").strip().lower()
    return any(alias in text for alias in _MATH_ALIASES)


def _tx(text: str | None) -> str:
    return maybe_hinglish(text or "", lecture_language=_LECTURE_LANGUAGE.get())


def _lang_rules() -> dict[str, Any]:
    return notes_language_rules(_LECTURE_LANGUAGE.get())


def _chunk_text(text: str, max_chars: int = 10000) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", cleaned) if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for para in paragraphs:
        extra = len(para) + 2
        if current and size + extra > max_chars:
            chunks.append("\n\n".join(current))
            current = [para]
            size = len(para)
        else:
            current.append(para)
            size += extra
    if current:
        chunks.append("\n\n".join(current))
    return chunks or [cleaned[:max_chars]]


def gather_chapter_source_text(chapter: Chapter) -> str:
    """Merge chapter text + uploaded book page OCR/text for complete notes."""
    parts: list[str] = []
    if (chapter.content or "").strip():
        parts.append(chapter.content.strip())

    try:
        pages = get_chapter_pages(chapter.id)
        page_bits: list[str] = []
        for page in pages:
            text = (page.text_content or "").strip()
            if text:
                page_bits.append(text)
        if page_bits:
            parts.append("\n\n".join(page_bits))
    except Exception as exc:
        logger.warning("Could not load book pages for chapter %s: %s", chapter.id, exc)

    merged = "\n\n".join(parts).strip()
    # Cap very large chapters but keep enough for detailed notes.
    if len(merged) > 120_000:
        merged = merged[:120_000]
    return merged


def _empty_payload(*, board: str, class_grade: int, subject: str, chapter_title: str) -> dict[str, Any]:
    return {
        "mode": "study_notes",
        "notes_version": NOTES_SCHEMA_VERSION,
        "board": board,
        "class_grade": class_grade,
        "subject": subject,
        "chapter_title": chapter_title,
        "overview": "",
        "topics": [],
        "questions_with_answers": [],
        "revision_sheet": [],
        "important_questions": [],
        "exam_tips": [],
    }


def _normalize_qa(raw: dict[str, Any]) -> dict[str, str] | None:
    question = _tx(str(raw.get("question") or "")).strip()
    if not question:
        return None
    return {
        "question": question[:500],
        "answer": _tx(str(raw.get("answer") or ""))[:2500],
        "steps": _tx(str(raw.get("steps") or raw.get("answer_outline") or ""))[:2000],
        "source": _tx(str(raw.get("source") or "textbook"))[:80],
    }


def _normalize_example(raw: Any) -> dict[str, str] | None:
    if isinstance(raw, str):
        text = _tx(raw).strip()
        if not text:
            return None
        return {"title": "Example", "problem": text, "solution": "", "steps": text}
    if not isinstance(raw, dict):
        return None
    title = _tx(str(raw.get("title") or "Worked example")).strip()
    problem = _tx(str(raw.get("problem") or raw.get("question") or "")).strip()
    solution = _tx(str(raw.get("solution") or raw.get("answer") or "")).strip()
    steps = _tx(str(raw.get("steps") or raw.get("working") or "")).strip()
    if not (problem or steps or solution):
        return None
    return {
        "title": title[:120],
        "problem": problem[:1200],
        "solution": solution[:1500],
        "steps": steps[:2500],
    }


def _normalize_topic(raw: dict[str, Any]) -> dict[str, Any] | None:
    title = _tx(str(raw.get("title") or "")).strip()
    if not title:
        return None

    worked_examples: list[dict[str, str]] = []
    for item in (raw.get("worked_examples") or raw.get("examples") or [])[:8]:
        ex = _normalize_example(item)
        if ex:
            worked_examples.append(ex)

    qa_items: list[dict[str, str]] = []
    for item in (raw.get("questions_with_answers") or raw.get("book_questions") or [])[:12]:
        if isinstance(item, dict):
            qa = _normalize_qa(item)
            if qa:
                qa_items.append(qa)

    practice_in = raw.get("practice") if isinstance(raw.get("practice"), list) else []
    practice: list[dict[str, str]] = []
    for item in practice_in[:8]:
        if not isinstance(item, dict):
            continue
        q = _tx(str(item.get("question") or "")).strip()
        if not q:
            continue
        practice.append(
            {
                "question": q[:450],
                "hint": _tx(str(item.get("hint") or ""))[:280],
                "answer": _tx(str(item.get("answer") or ""))[:1800],
                "answer_outline": _tx(str(item.get("answer_outline") or item.get("steps") or ""))[:800],
            }
        )

    return {
        "title": title[:180],
        "theory": _tx(str(raw.get("theory") or ""))[:12000],
        "formulas": [_tx(str(f))[:280] for f in (raw.get("formulas") or [])[:15] if str(f).strip()],
        "worked_examples": worked_examples,
        "examples": [ex.get("problem", "") or ex.get("steps", "") for ex in worked_examples[:6]],
        "key_points": [_tx(str(p))[:280] for p in (raw.get("key_points") or [])[:12] if str(p).strip()],
        "questions_with_answers": qa_items,
        "practice": practice,
        "exam_tips": [_tx(str(t))[:280] for t in (raw.get("exam_tips") or [])[:8] if str(t).strip()],
    }


def _ai_topics_for_chunk(
    *,
    chunk: str,
    chunk_index: int,
    total_chunks: int,
    board: str,
    class_grade: int,
    subject: str,
    chapter_title: str,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    if not settings.openai_api_key or not chunk.strip():
        return [], []

    math = _is_math(subject)
    grade_bit = f"Class {class_grade}" if class_grade else "school level"
    lang_rules = _lang_rules()
    prompt = f"""You write VERY DETAILED, COMPLETE study notes for Indian school students.

Board: {board}
Standard: {grade_bit}
Subject: {subject}
Chapter: {chapter_title}
Language: {lang_rules["label"]}
Source chunk: {chunk_index}/{total_chunks}

CRITICAL RULES:
1) Cover EVERY topic/subtopic in the source — definitions, properties, theorems, methods, diagrams described in words.
2) Theory must be LONG and exam-ready (student should not need the textbook).
3) Include at least 1-2 WORKED EXAMPLES per topic with problem, step-by-step working, and final answer.
4) SCAN the source for ANY questions (Exercise, Q1, Q2, ?, numbered items, "Solve", "Find", "Prove").
   For EVERY question found in this chunk, add it to questions_with_answers with a FULL written answer and steps.
   If answer is in source, use it; if not, solve it correctly for {board} {grade_bit}.
5) LANGUAGE/SCRIPT: {lang_rules["script_rule"]}
   Preserve source language meaning and extract context correctly in that language.
6) Formulas in plain text (e.g. ax + by + c = 0).
7) No markdown tables or code fences.

{"Mathematics: include formulas, multiple worked examples, and solved book questions." if math else "Include conceptual examples and solved textbook questions where present."}

Return ONLY valid JSON:
{{
  "topics": [
    {{
      "title": "topic name",
      "theory": "very detailed multi-paragraph explanation",
      "formulas": ["..."],
      "worked_examples": [
        {{"title": "Example 1", "problem": "...", "steps": "step by step", "solution": "final answer"}}
      ],
      "key_points": ["..."],
      "questions_with_answers": [
        {{"question": "exact or paraphrased question from source", "steps": "full solution steps", "answer": "final answer", "source": "exercise/page"}}
      ],
      "practice": [{{"question": "...", "hint": "...", "answer": "full answer", "answer_outline": "steps"}}],
      "exam_tips": ["..."]
    }}
  ],
  "chapter_questions": [
    {{"question": "...", "steps": "...", "answer": "...", "source": "exercise"}}
  ]
}}

SOURCE TEXT:
{chunk}
"""
    try:
        response = _client().chat.completions.create(
            model=settings.lecture_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You create exhaustive {board} {grade_bit} {subject} study notes as strict JSON. "
                        f"{lang_rules['script_rule']} "
                        "Never skip topics. Always include worked examples. "
                        "Always extract and ANSWER questions found in uploaded/textbook content."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=12000,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        topics_raw = data.get("topics") if isinstance(data, dict) else None
        chapter_q_raw = data.get("chapter_questions") if isinstance(data, dict) else None

        topics: list[dict[str, Any]] = []
        if isinstance(topics_raw, list):
            for item in topics_raw:
                if isinstance(item, dict):
                    normalized = _normalize_topic(item)
                    if normalized:
                        topics.append(normalized)

        chapter_qa: list[dict[str, str]] = []
        if isinstance(chapter_q_raw, list):
            for item in chapter_q_raw:
                if isinstance(item, dict):
                    qa = _normalize_qa(item)
                    if qa:
                        chapter_qa.append(qa)
        return topics, chapter_qa
    except Exception as exc:
        logger.warning("Study notes chunk generation failed: %s", exc)
        return [], []


def _merge_topic(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    if len(incoming.get("theory") or "") > len(existing.get("theory") or ""):
        existing["theory"] = incoming["theory"]
    for field in ("formulas", "key_points", "exam_tips", "examples"):
        merged = list(existing.get(field) or [])
        for item in incoming.get(field) or []:
            if item and item not in merged:
                merged.append(item)
        existing[field] = merged[:15]
    for field in ("worked_examples", "questions_with_answers", "practice"):
        merged = list(existing.get(field) or [])
        seen = {json.dumps(x, sort_keys=True) for x in merged}
        for item in incoming.get(field) or []:
            key = json.dumps(item, sort_keys=True)
            if key not in seen:
                merged.append(item)
                seen.add(key)
        existing[field] = merged[:12]


def _fallback_topics_from_content(content: str, *, math: bool) -> list[dict[str, Any]]:
    blocks = [b.strip() for b in re.split(r"\n{2,}", content or "") if b.strip()]
    topics: list[dict[str, Any]] = []
    for index, block in enumerate(blocks[:40], start=1):
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        title = lines[0][:120] if lines else f"Topic {index}"
        body = " ".join(lines[1:] or lines)
        topics.append(
            {
                "title": _tx(title),
                "theory": _tx(body)[:8000],
                "formulas": [],
                "worked_examples": [],
                "examples": [],
                "key_points": [
                    _tx(s)[:240]
                    for s in re.split(r"(?<=[.!?])\s+", body)[:6]
                    if 20 <= len(s) <= 220
                ],
                "questions_with_answers": [],
                "practice": (
                    [
                        {
                            "question": f"Practice one question based on '{_tx(title)}'.",
                            "hint": "Use definitions and formulas from this topic.",
                            "answer": "",
                            "answer_outline": "Write given, formula, steps, final answer.",
                        }
                    ]
                    if math
                    else []
                ),
                "exam_tips": ["Revise this topic with examples before exams."],
            }
        )
    return topics


def _ai_overview_and_revision(
    *,
    topics: list[dict[str, Any]],
    board: str,
    class_grade: int,
    subject: str,
    chapter_title: str,
) -> dict[str, Any]:
    titles = [t.get("title") for t in topics if t.get("title")]
    if not settings.openai_api_key or not titles:
        return {
            "overview": f"Complete detailed {board} Class {class_grade} notes for {chapter_title}.",
            "revision_sheet": titles[:25],
            "important_questions": [],
            "exam_tips": ["Revise every topic with examples and solved questions before the exam."],
        }
    prompt = f"""Create chapter overview and revision pack for {board} Class {class_grade} {subject}, chapter "{chapter_title}".
Topics: {json.dumps(titles, ensure_ascii=False)}
LANGUAGE/SCRIPT: {_lang_rules()["script_rule"]}
Return JSON:
{{
  "overview": "3-5 sentence detailed overview of full chapter",
  "revision_sheet": ["short revision bullets for every major topic"],
  "important_questions": ["exam-style questions with topic hint"],
  "exam_tips": ["board exam tips"]
}}
"""
    try:
        response = _client().chat.completions.create(
            model=settings.lecture_model,
            messages=[
                {"role": "system", "content": "Return strict JSON for chapter revision notes."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content or "{}")
        if not isinstance(data, dict):
            raise ValueError("bad overview payload")
        return {
            "overview": _tx(str(data.get("overview") or ""))[:1600],
            "revision_sheet": [
                _tx(str(x))[:260] for x in (data.get("revision_sheet") or [])[:35] if str(x).strip()
            ],
            "important_questions": [
                _tx(str(x))[:400] for x in (data.get("important_questions") or [])[:20] if str(x).strip()
            ],
            "exam_tips": [_tx(str(x))[:280] for x in (data.get("exam_tips") or [])[:12] if str(x).strip()],
        }
    except Exception as exc:
        logger.warning("Study notes overview generation failed: %s", exc)
        return {
            "overview": f"Complete detailed {board} Class {class_grade} notes for {chapter_title}.",
            "revision_sheet": [_tx(str(t)) for t in titles[:25]],
            "important_questions": [],
            "exam_tips": ["Revise every topic with examples and solved questions before the exam."],
        }


def build_complete_study_notes_payload(
    *,
    chapter_content: str,
    board: str,
    class_grade: int,
    subject: str,
    chapter_title: str,
    lecture_language: str | None = None,
) -> dict[str, Any]:
    token = _LECTURE_LANGUAGE.set(lecture_language)
    try:
        payload = _empty_payload(
            board=board,
            class_grade=class_grade,
            subject=subject,
            chapter_title=chapter_title,
        )
        chunks = _chunk_text(chapter_content, max_chars=10000)
        topics: list[dict[str, Any]] = []
        chapter_qa: list[dict[str, str]] = []
        seen: set[str] = set()
        qa_seen: set[str] = set()

        for index, chunk in enumerate(chunks, start=1):
            chunk_topics, chunk_qa = _ai_topics_for_chunk(
                chunk=chunk,
                chunk_index=index,
                total_chunks=len(chunks),
                board=board,
                class_grade=class_grade,
                subject=subject,
                chapter_title=chapter_title,
            )
            for qa in chunk_qa:
                key = re.sub(r"\s+", " ", qa.get("question", "").lower()).strip()
                if key and key not in qa_seen:
                    qa_seen.add(key)
                    chapter_qa.append(qa)

            for topic in chunk_topics:
                for qa in topic.get("questions_with_answers") or []:
                    key = re.sub(r"\s+", " ", qa.get("question", "").lower()).strip()
                    if key and key not in qa_seen:
                        qa_seen.add(key)
                        chapter_qa.append(qa)

                key = re.sub(r"\s+", " ", topic["title"].lower()).strip()
                if key in seen:
                    for existing in topics:
                        if re.sub(r"\s+", " ", existing["title"].lower()).strip() == key:
                            _merge_topic(existing, topic)
                            break
                    continue
                seen.add(key)
                topics.append(topic)

        if not topics:
            topics = _fallback_topics_from_content(chapter_content, math=_is_math(subject))

        pack = _ai_overview_and_revision(
            topics=topics,
            board=board,
            class_grade=class_grade,
            subject=subject,
            chapter_title=chapter_title,
        )
        payload.update(pack)
        payload["topics"] = topics
        payload["questions_with_answers"] = chapter_qa[:40]
        payload["notes_version"] = NOTES_SCHEMA_VERSION
        payload["language"] = _lang_rules()["key"]
        return payload
    finally:
        _LECTURE_LANGUAGE.reset(token)


def notes_need_regeneration(note: ChapterStudyNote | None) -> bool:
    if not note or note.status != "ready":
        return True
    raw = (note.content_json or "").strip()
    if not raw or raw == "{}":
        return True
    try:
        data = json.loads(raw)
        if int(data.get("notes_version") or 0) < NOTES_SCHEMA_VERSION:
            return True
    except Exception:
        return True
    return False


def resolve_board(preferred: str | None = None) -> str:
    board = (preferred or "").strip()
    return board or "CBSE"


def generate_and_store_chapter_study_notes(
    db: Session,
    chapter_id: int,
    *,
    board: str | None = None,
    force: bool = False,
) -> ChapterStudyNote | None:
    chapter = (
        db.query(Chapter)
        .options(joinedload(Chapter.book), joinedload(Chapter.study_notes))
        .filter(Chapter.id == chapter_id)
        .first()
    )
    if not chapter or not chapter.book:
        return None

    existing = chapter.study_notes
    if existing and not force and not notes_need_regeneration(existing):
        return existing

    if chapter_id in _GENERATING:
        return existing
    _GENERATING.add(chapter_id)
    try:
        book = chapter.book
        board_name = resolve_board(board)
        lecture_language = lecture_language_from_content_code(
            getattr(book, "content_language", None),
            book.subject,
        )
        content = gather_chapter_source_text(chapter)
        if not content:
            payload = _empty_payload(
                board=board_name,
                class_grade=book.class_grade,
                subject=book.subject,
                chapter_title=chapter.title,
            )
            payload["overview"] = "Chapter content is not available yet for detailed notes."
            payload["language"] = lecture_language
        else:
            payload = build_complete_study_notes_payload(
                chapter_content=content,
                board=board_name,
                class_grade=int(book.class_grade or 0),
                subject=book.subject or "",
                chapter_title=chapter.title or "",
                lecture_language=lecture_language,
            )

        topic_count = len(payload.get("topics") or [])
        now = datetime.utcnow()
        if existing:
            existing.board = board_name
            existing.class_grade = int(book.class_grade or 0)
            existing.subject = book.subject or ""
            existing.title = f"{chapter.title} · Detailed notes"
            existing.status = "ready"
            existing.content_json = json.dumps(payload, ensure_ascii=False)
            existing.topic_count = topic_count
            existing.updated_at = now
            note = existing
        else:
            note = ChapterStudyNote(
                chapter_id=chapter.id,
                board=board_name,
                class_grade=int(book.class_grade or 0),
                subject=book.subject or "",
                title=f"{chapter.title} · Detailed notes",
                status="ready",
                content_json=json.dumps(payload, ensure_ascii=False),
                topic_count=topic_count,
                generated_at=now,
                updated_at=now,
            )
            db.add(note)
        db.commit()
        db.refresh(note)
        logger.info(
            "Stored detailed study notes for chapter %s (%s topics, %s Q&A, board=%s)",
            chapter_id,
            topic_count,
            len(payload.get("questions_with_answers") or []),
            board_name,
        )
        return note
    except Exception:
        db.rollback()
        logger.exception("Failed generating study notes for chapter %s", chapter_id)
        return None
    finally:
        _GENERATING.discard(chapter_id)


def ensure_chapter_study_notes(chapter_id: int, *, board: str | None = None, force: bool = False) -> None:
    """Background-safe entrypoint."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        generate_and_store_chapter_study_notes(db, chapter_id, board=board, force=force)
    finally:
        db.close()


def is_generating_study_notes(chapter_id: int) -> bool:
    return chapter_id in _GENERATING
