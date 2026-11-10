"""Structured transcribed study notes synced to lecture voice timeline."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import OpenAI

from app.config import settings
from app.utils.language import maybe_hinglish, notes_language_rules

logger = logging.getLogger(__name__)

_MATH_ALIASES = ("math", "maths", "mathematics", "गणित")


def _client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def _is_math(subject: str) -> bool:
    text = (subject or "").strip().lower()
    return any(alias in text for alias in _MATH_ALIASES)


def _tx(text: str | None, lecture_language: str | None) -> str:
    return maybe_hinglish(text or "", lecture_language=lecture_language)


def _clean_spoken_segment(text: str, *, lecture_language: str | None = None) -> str:
    cleaned = re.sub(r"[|═\-_]{3,}", " ", text or "")
    cleaned = re.sub(r"[#*_`~><\[\]{}\\]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return _tx(cleaned, lecture_language)


def _split_lines(text: str) -> list[str]:
    """Split transcript into readable speaking lines (prefer sentence boundaries)."""
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return []

    # Keep intentional paragraph breaks as separate lines first.
    chunks: list[str] = []
    for para in re.split(r"\n+", raw):
        para = para.strip()
        if not para:
            continue
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", para) if s.strip()]
        if sentences:
            chunks.extend(sentences)
        else:
            chunks.append(para)

    # Merge tiny fragments so karaoke lines aren't too choppy.
    lines: list[str] = []
    buf = ""
    for part in chunks:
        candidate = f"{buf} {part}".strip() if buf else part
        if len(candidate) < 28 and buf:
            buf = candidate
            continue
        if buf and len(part) < 18:
            buf = candidate
            continue
        if buf:
            lines.append(buf)
        buf = part
    if buf:
        lines.append(buf)
    return lines


def _build_timed_lines(
    text: str,
    *,
    start_seconds: float,
    duration_seconds: float,
) -> list[dict[str, Any]]:
    lines = _split_lines(text)
    if not lines:
        return []

    weights = [max(len(re.findall(r"\S+", line)), 1) for line in lines]
    total_w = float(sum(weights)) or 1.0
    span = max(float(duration_seconds or 1.0), 0.5)
    cursor = float(start_seconds or 0.0)
    timed: list[dict[str, Any]] = []

    for index, (line, weight) in enumerate(zip(lines, weights)):
        share = span * (weight / total_w)
        # Keep last line flush to page end to avoid drift.
        if index == len(lines) - 1:
            end = float(start_seconds or 0.0) + span
            dur = max(end - cursor, 0.2)
        else:
            dur = max(share, 0.35)
            end = cursor + dur
        timed.append(
            {
                "text": line,
                "start_seconds": round(cursor, 3),
                "end_seconds": round(end, 3),
                "duration_seconds": round(dur, 3),
            }
        )
        cursor = end
    return timed


def _paragraphize(text: str) -> str:
    """Turn spoken text into readable transcript paragraphs (full length)."""
    lines = _split_lines(text)
    if not lines:
        return (text or "").strip()
    paragraphs: list[str] = []
    chunk: list[str] = []
    for sentence in lines:
        chunk.append(sentence)
        if len(chunk) >= 2:
            paragraphs.append(" ".join(chunk))
            chunk = []
    if chunk:
        paragraphs.append(" ".join(chunk))
    return "\n\n".join(paragraphs)


def _prefer_complete_transcript(
    spoken: str,
    ai_transcript: str,
    *,
    lecture_language: str | None = None,
) -> str:
    """Prefer AI cleanup only when it preserves nearly all spoken content."""
    spoken_clean = _clean_spoken_segment(spoken, lecture_language=lecture_language)
    ai_clean = _tx((ai_transcript or "").strip(), lecture_language)
    if not ai_clean:
        return spoken_clean
    if not spoken_clean:
        return ai_clean
    # If AI heavily shortened the speech, keep the full spoken transcript.
    if len(ai_clean) < max(80, int(len(spoken_clean) * 0.7)):
        return spoken_clean
    return ai_clean


def _fallback_page(
    segment: str,
    page_number: int,
    *,
    math: bool,
    lecture_language: str | None = None,
) -> dict[str, Any]:
    text = _clean_spoken_segment(segment, lecture_language=lecture_language)
    lines = _split_lines(text)
    title = lines[0][:90] if lines else f"Notes page {page_number}"
    if len(title) > 72:
        title = title[:69].rsplit(" ", 1)[0] + "…"

    transcript = _paragraphize(text) or text
    key_points = []
    for sentence in lines:
        if 18 <= len(sentence) <= 180:
            key_points.append(sentence)
        if len(key_points) >= 6:
            break
    if not key_points and text:
        key_points = [text[:160]]

    # Theory can summarize, but keep a fuller body than before.
    theory_body = " ".join(lines[:10]) if lines else text
    if len(theory_body) > 3200:
        theory_body = theory_body[:3200].rsplit(" ", 1)[0]
    practice_q = (
        f"Based on this transcribed part ('{title}'), solve one short question step by step."
    )

    if math:
        sections = [
            {"heading": "Transcript", "body": transcript, "bullets": []},
            {"heading": "Theory", "body": theory_body, "bullets": key_points[:5]},
            {
                "heading": "Practice",
                "body": "Is transcribed part se related practice karo — pehle definition/formula, phir calculation.",
                "bullets": [
                    practice_q,
                    "Write: Given → Formula → Steps → Final answer.",
                ],
            },
        ]
    else:
        sections = [
            {"heading": "Transcript", "body": transcript, "bullets": []},
            {"heading": "Theory", "body": theory_body, "bullets": key_points[:5]},
            {
                "heading": "Practice",
                "body": "Is part ko apne words me summarize karo aur ek short question answer karo.",
                "bullets": key_points[:3] or [practice_q],
            },
        ]

    return {
        "title": title,
        "summary": (lines[0] if lines else text)[:280],
        "transcript": transcript,
        "sections": sections,
        "key_points": key_points[:6],
        "practice": [
            {
                "question": practice_q,
                "hint": "Use only what was taught in this transcribed page.",
                "answer_outline": "Recall definition/formula from transcript, apply, simplify, write answer.",
            }
        ],
    }


def _ai_note_pages(
    *,
    timeline: list[dict],
    subject: str,
    chapter_title: str,
    class_grade: int | None = None,
    lecture_language: str | None = None,
) -> list[dict[str, Any]] | None:
    if not settings.openai_api_key or not timeline:
        return None

    math = _is_math(subject)
    lang_rules = notes_language_rules(lecture_language)
    pages_in = [
        {
            "page": index,
            # Full spoken text for complete transcripts (no aggressive truncation).
            "spoken": _clean_spoken_segment(item.get("text") or "", lecture_language=lecture_language)[:6000],
            "start_seconds": item.get("start_seconds"),
            "duration_seconds": item.get("duration_seconds"),
        }
        for index, item in enumerate(timeline, start=1)
    ]
    grade_bit = f"Class {class_grade}" if class_grade else "school"

    prompt = f"""You convert spoken lecture audio-text into STRUCTURED TRANSCRIBED NOTES.

Student: {grade_bit}
Subject: {subject}
Chapter: {chapter_title}
Language: {lang_rules["label"]}

For EACH input page, the "spoken" field is what the teacher said. Your job:
1) Clean it into a COMPLETE TRANSCRIPT — keep ALL teaching content, do not shorten or omit ideas.
2) Structure Theory and Practice from that same full transcript.

CRITICAL:
- Transcript must be COMPLETE and faithful (same order, same points). Light cleanup only (grammar/punctuation).
- NEVER summarize away content from spoken text. If spoken is long, transcript stays long.
- LANGUAGE/SCRIPT: {lang_rules["script_rule"]}
- Extract context, terms, and examples in the SAME language/script as the lecture.
- No pipe tables, ascii art, markdown code fences.
- Formulas in plain text only.

{"Mathematics: every page MUST have Transcript + Theory + Practice from the same spoken content." if math else "Every page MUST have Transcript + Theory + Practice from the same spoken content."}

Return ONLY valid JSON:
{{
  "pages": [
    {{
      "page": 1,
      "title": "short topic title from speech",
      "summary": "1 line of what this page taught",
      "transcript": "COMPLETE cleaned multi-paragraph transcript covering ALL spoken content",
      "sections": [
        {{"heading": "Transcript", "body": "COMPLETE cleaned transcript", "bullets": []}},
        {{"heading": "Theory", "body": "definitions/formulas/explanation extracted from transcript", "bullets": ["..."]}},
        {{"heading": "Practice", "body": "how to apply this page", "bullets": ["Q1 ..."]}}
      ],
      "key_points": ["point from transcript", "..."],
      "practice": [
        {{"question": "...", "hint": "...", "answer_outline": "..."}}
      ]
    }}
  ]
}}

Pages must match input order and page numbers exactly ({len(pages_in)} pages).

INPUT:
{json.dumps(pages_in, ensure_ascii=False)}
"""
    try:
        response = _client().chat.completions.create(
            model=settings.lecture_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You produce complete structured transcribed class notes as strict JSON. "
                        "Transcript must include ALL spoken teaching content, cleaned but not shortened. "
                        f"{lang_rules['script_rule']} "
                        "Theory and Practice come after the full transcript."
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
        pages = data.get("pages") if isinstance(data, dict) else None
        if not isinstance(pages, list) or not pages:
            return None
        return pages
    except Exception as exc:
        logger.warning("AI transcribed notes generation failed: %s", exc)
        return None


def _ensure_section(
    sections: list[dict[str, Any]],
    heading: str,
    fallback_section: dict[str, Any],
) -> list[dict[str, Any]]:
    key = heading.strip().lower()
    existing = {str(s.get("heading") or "").strip().lower() for s in sections}
    if key not in existing:
        sections.append(fallback_section)
    return sections


def _normalize_ai_page(
    raw: dict[str, Any],
    fallback: dict[str, Any],
    page_number: int,
    *,
    math: bool,
    spoken: str,
    lecture_language: str | None = None,
) -> dict[str, Any]:
    title = _tx(str(raw.get("title") or fallback["title"]), lecture_language)[:120]
    summary = _tx(str(raw.get("summary") or fallback["summary"]), lecture_language)[:400]
    transcript = _prefer_complete_transcript(
        spoken,
        str(raw.get("transcript") or fallback.get("transcript") or ""),
        lecture_language=lecture_language,
    )
    if not transcript:
        transcript = str(fallback.get("transcript") or "")

    sections_in = raw.get("sections") if isinstance(raw.get("sections"), list) else []
    sections: list[dict[str, Any]] = []
    for section in sections_in[:6]:
        if not isinstance(section, dict):
            continue
        bullets = section.get("bullets") if isinstance(section.get("bullets"), list) else []
        heading = _tx(str(section.get("heading") or "Notes"), lecture_language)[:80]
        body_raw = str(section.get("body") or "")
        # Transcript section must stay complete.
        if heading.strip().lower() == "transcript":
            body = transcript
        else:
            body = _tx(body_raw, lecture_language)[:4000]
        sections.append(
            {
                "heading": heading,
                "body": body,
                "bullets": [_tx(str(b), lecture_language)[:260] for b in bullets[:8] if str(b).strip()],
            }
        )
    if not sections:
        sections = list(fallback["sections"])

    by_heading = {str(s.get("heading") or "").strip().lower(): s for s in sections}
    fb_by_heading = {str(s.get("heading") or "").strip().lower(): s for s in fallback["sections"]}

    ordered: list[dict[str, Any]] = []
    for required in ("transcript", "theory", "practice"):
        section = by_heading.get(required) or fb_by_heading.get(required)
        if section:
            if required == "transcript":
                section = {**section, "body": transcript, "bullets": []}
            ordered.append(section)

    for section in sections:
        heading = str(section.get("heading") or "").strip().lower()
        if heading not in {"transcript", "theory", "practice"}:
            ordered.append(section)

    if math:
        ordered = _ensure_section(ordered, "Theory", fb_by_heading.get("theory", fallback["sections"][1]))
        ordered = _ensure_section(ordered, "Practice", fb_by_heading.get("practice", fallback["sections"][-1]))

    if not any(str(s.get("heading") or "").lower() == "transcript" for s in ordered):
        ordered.insert(0, {"heading": "Transcript", "body": transcript, "bullets": []})

    key_points = raw.get("key_points") if isinstance(raw.get("key_points"), list) else []
    key_points = [_tx(str(p), lecture_language)[:220] for p in key_points[:8] if str(p).strip()]
    if not key_points:
        key_points = fallback["key_points"]

    practice_in = raw.get("practice") if isinstance(raw.get("practice"), list) else []
    practice: list[dict[str, str]] = []
    for item in practice_in[:3]:
        if not isinstance(item, dict):
            continue
        q = _tx(str(item.get("question") or ""), lecture_language).strip()
        if not q:
            continue
        practice.append(
            {
                "question": q[:320],
                "hint": _tx(str(item.get("hint") or ""), lecture_language)[:240],
                "answer_outline": _tx(str(item.get("answer_outline") or ""), lecture_language)[:450],
            }
        )
    if not practice:
        practice = list(fallback.get("practice") or [])

    return {
        "title": title or f"Notes page {page_number}",
        "summary": summary,
        "transcript": transcript,
        "sections": ordered,
        "key_points": key_points,
        "practice": practice,
    }


def generate_note_frames_from_timeline(
    *,
    timeline: list[dict],
    subject: str,
    chapter_title: str,
    class_grade: int | None = None,
    lecture_language: str | None = None,
) -> list[dict]:
    """
    Build timed note pages from the voice lecture timeline.
    Each page is a complete structured transcription with per-line audio timings.
    """
    if not timeline:
        return []

    math = _is_math(subject)
    ai_pages = _ai_note_pages(
        timeline=timeline,
        subject=subject,
        chapter_title=chapter_title,
        class_grade=class_grade,
        lecture_language=lecture_language,
    )
    ai_by_page: dict[int, dict[str, Any]] = {}
    if ai_pages:
        for item in ai_pages:
            try:
                page_no = int(item.get("page") or 0)
            except (TypeError, ValueError):
                continue
            if page_no > 0:
                ai_by_page[page_no] = item

    frames: list[dict] = []
    for index, item in enumerate(timeline, start=1):
        spoken = item.get("text") or ""
        start_s = round(float(item.get("start_seconds") or 0), 2)
        dur_s = round(max(float(item.get("duration_seconds") or 1), 0.5), 2)
        fallback = _fallback_page(spoken, index, math=math, lecture_language=lecture_language)
        page = _normalize_ai_page(
            ai_by_page.get(index, {}),
            fallback,
            index,
            math=math,
            spoken=spoken,
            lecture_language=lecture_language,
        )
        transcript = page.get("transcript") or _clean_spoken_segment(
            spoken, lecture_language=lecture_language
        )
        lines = _build_timed_lines(transcript, start_seconds=start_s, duration_seconds=dur_s)
        # Keep transcript section body as line-joined text for readability.
        for section in page["sections"]:
            if str(section.get("heading") or "").strip().lower() == "transcript":
                section["body"] = "\n".join(line["text"] for line in lines) if lines else transcript

        payload = {
            "mode": "notes",
            "title": page["title"],
            "summary": page["summary"],
            "transcript": transcript,
            "lines": lines,
            "sections": page["sections"],
            "key_points": page["key_points"],
            "practice": page.get("practice") or [],
            "spoken_excerpt": _clean_spoken_segment(spoken, lecture_language=lecture_language)[:800],
            "language": notes_language_rules(lecture_language)["key"],
        }
        frames.append(
            {
                "frame_number": index,
                "caption": page["title"][:500],
                "segment_text": json.dumps(payload, ensure_ascii=False),
                "image_path": "",
                "start_seconds": start_s,
                "duration_seconds": dur_s,
                "book_page_number": index,
                "source_type": "notes",
            }
        )

    logger.info(
        "Built %s complete transcribed note page(s) for %s / %s (math=%s, lang=%s)",
        len(frames),
        subject,
        chapter_title,
        math,
        notes_language_rules(lecture_language)["key"],
    )
    return frames
