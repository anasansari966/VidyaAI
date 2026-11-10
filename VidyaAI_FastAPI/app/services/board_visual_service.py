"""Digital board visual frames for Mathematics lectures (no textbook page images)."""

from __future__ import annotations

import json
import logging
import re

from app.config import settings
from app.services.visual_service import segment_timings, split_script_into_segments
from app.utils.hinglish import to_hinglish

logger = logging.getLogger(__name__)

MATH_SUBJECT_ALIASES = ("math", "maths", "mathematics", "गणित")

_EQ_HINT = re.compile(
    r"[=≈≠≤≥<>]|\\frac|\\sqrt|\^|√|÷|×|±|\b\d+\s*[+\-*/]\s*\d+\b|"
    r"\b[xyzabc]\s*[=]\s*|\b(sin|cos|tan|log|ln)\b",
    re.I,
)
_STEP_HINT = re.compile(r"^(step\s*\d+|hence|therefore|so,|thus|finally|now,|next,|ab,|toh,)", re.I)
_HEADING_HINT = re.compile(
    r"^(chapter|topic|formula|theorem|definition|example|exercise|solve|find|real numbers|yaani)\b",
    re.I,
)


def is_math_subject(subject: str | None) -> bool:
    text = (subject or "").strip().lower()
    if not text:
        return False
    return any(alias in text for alias in MATH_SUBJECT_ALIASES)


def _clean_line(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    cleaned = re.sub(r"^[\-\*\d\.\)\(]+\s*", "", cleaned)
    # Board always uses Hinglish / Latin — never Devanagari.
    cleaned = to_hinglish(cleaned)
    return cleaned[:160]


def _extract_board_lines(segment: str, *, max_lines: int = 5) -> list[dict]:
    """Turn a spoken lecture segment into short board writing lines (Hinglish)."""
    candidates: list[dict] = []
    seen: set[str] = set()

    raw_lines = [ln.strip() for ln in segment.replace("\r", "").split("\n") if ln.strip()]
    if len(raw_lines) <= 1:
        raw_lines = [p.strip() for p in re.split(r"(?<=[.!?।])\s+", segment) if p.strip()]

    for raw in raw_lines:
        line = _clean_line(raw)
        if len(line) < 3:
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)

        if _EQ_HINT.search(line) or any(ch in line for ch in "=√πΔθ"):
            kind = "equation"
        elif _STEP_HINT.match(line):
            kind = "step"
        elif _HEADING_HINT.match(line) or len(line) <= 42:
            kind = "heading" if len(candidates) == 0 else "note"
        else:
            if len(line) > 100:
                shortened = line[:96].rsplit(" ", 1)[0].strip()
                if len(shortened) < 24:
                    continue
                line = f"{shortened}…"
                kind = "note"
            else:
                kind = "note"

        candidates.append({"kind": kind, "text": line})
        if len(candidates) >= max_lines:
            break

    if not candidates:
        snippet = _clean_line(segment)[:90] or "Working on the board…"
        candidates = [{"kind": "heading", "text": snippet}]

    return candidates


def _frames_from_timed_segments(timed_segments: list[dict]) -> list[dict]:
    frames: list[dict] = []
    for index, item in enumerate(timed_segments, start=1):
        segment = item.get("text") or ""
        start_seconds = float(item.get("start_seconds") or 0)
        duration_seconds = float(item.get("duration_seconds") or 1)
        lines = _extract_board_lines(segment)
        caption = lines[0]["text"] if lines else f"Board step {index}"
        payload = {
            "mode": "board",
            "narration": to_hinglish(segment[:1200]),
            "lines": lines,
        }
        frames.append(
            {
                "frame_number": index,
                "caption": caption[:500],
                "segment_text": json.dumps(payload, ensure_ascii=False),
                "image_path": "",
                "start_seconds": round(start_seconds, 2),
                "duration_seconds": round(max(duration_seconds, 0.5), 2),
                "book_page_number": None,
                "source_type": "board",
            }
        )
    return frames


def generate_math_board_frames_from_timeline(timeline: list[dict]) -> list[dict]:
    """Build board frames from the exact voice-lecture timeline (same segments + timings)."""
    if not timeline:
        return []
    frames = _frames_from_timed_segments(timeline)
    logger.info("Built %s maths board frame(s) from voice timeline", len(frames))
    return frames


def generate_math_board_frames(
    *,
    script: str,
    duration_minutes: float,
    max_frames: int | None = None,
    timeline: list[dict] | None = None,
    total_seconds: float | None = None,
) -> list[dict]:
    """
    Build timed digital-board frames from the maths lecture script.

    Prefer `timeline` from generate_audio_with_timeline so board and voice share
    the same teaching segments and real audio timings.
    """
    if timeline:
        return generate_math_board_frames_from_timeline(timeline)

    limit = max(3, min(max_frames or settings.max_visual_frames, 10))
    segments = split_script_into_segments(script, max_segments=limit)
    if not segments:
        segments = [script[:800] or "Let's solve this on the board."]

    total = float(total_seconds) if total_seconds and total_seconds > 0 else 0.0
    if total <= 0:
        total = max(
            duration_minutes * 60,
            len(script.split()) / max(settings.words_per_minute, 1) * 60,
            len(segments) * 8,
        )
    timings = segment_timings(segments, total)
    timed = [
        {
            "text": segment,
            "start_seconds": start,
            "duration_seconds": dur,
        }
        for segment, (start, dur) in zip(segments, timings)
    ]
    frames = _frames_from_timed_segments(timed)
    logger.info("Built %s maths digital-board frame(s) with estimated timings", len(frames))
    return frames
