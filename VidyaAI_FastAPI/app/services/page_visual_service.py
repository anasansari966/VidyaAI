import logging
import re

from app.config import settings
from app.services.page_extraction_service import get_chapter_pages
from app.services.visual_service import split_script_into_segments

logger = logging.getLogger(__name__)

_CHAPTER_ENTRY = re.compile(
    r"Chapter\s+(\d+)\s+(.+?)\s+\d+(?=\s+Chapter|\s+Answers|\s*$|\s+FOREWORD)",
    re.IGNORECASE,
)


def _normalize_title(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", title.strip().rstrip(".?"))
    if cleaned.isupper():
        return cleaned.title()
    return cleaned


def _first_complete_sentences(text: str, *, max_len: int = 280) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return ""
    if len(cleaned) <= max_len:
        return cleaned

    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    if len(parts) > 1:
        result: list[str] = []
        length = 0
        for part in parts:
            part = part.strip()
            if not part:
                continue
            extra = len(part) + (1 if result else 0)
            if length + extra > max_len and result:
                break
            result.append(part if part[-1] in ".!?" else f"{part}.")
            length += extra
        if result:
            return " ".join(result)

    snippet = cleaned[:max_len]
    if " " in snippet:
        snippet = snippet.rsplit(" ", 1)[0]
    return f"{snippet}."


def _summarize_contents_page(cleaned: str, chapter_matches: list[tuple[str, str]]) -> str:
    numbers = [int(num) for num, _ in chapter_matches]
    titles = [_normalize_title(title) for _, title in chapter_matches]
    first_n, last_n = numbers[0], numbers[-1]

    extras: list[str] = []
    if re.search(r"\bFOREWORD\b", cleaned, re.I):
        extras.append("foreword")
    if re.search(r"\bAnswers\b", cleaned, re.I):
        extras.append("answers")

    if first_n == last_n:
        range_text = f"Chapter {first_n}, \"{titles[0]}\""
    else:
        range_text = f"Chapters {first_n}-{last_n}, from \"{titles[0]}\" to \"{titles[-1]}\""

    if extras:
        extra_text = ", ".join(extras)
        return f"Table of contents page with {extra_text} and {range_text}."
    return f"Table of contents page listing {range_text}."


def _summarize_chapter_opening(cleaned: str, *, max_len: int = 280) -> str | None:
    match = re.match(
        r"Chapter\s+(\d+)\s+(.+?)(?:\?\s+|\.\s+|\s+\d+\s+)",
        cleaned,
        re.I,
    )
    if not match:
        return None

    chapter_num = match.group(1)
    title = _normalize_title(match.group(2))
    body = cleaned[match.end() :].strip()
    heading = f"Chapter {chapter_num}: {title}"

    if not body:
        return f"{heading}."

    intro = _first_complete_sentences(body, max_len=max(120, max_len - len(heading) - 2))
    if intro:
        return f"{heading}. {intro}"
    return f"{heading}."


def summarize_page_text(text: str | None, *, max_len: int = 280) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return ""

    chapter_matches = _CHAPTER_ENTRY.findall(cleaned)
    is_contents = bool(re.search(r"\bCONTENTS\b", cleaned, re.I)) or len(chapter_matches) >= 3
    if is_contents and chapter_matches:
        return _summarize_contents_page(cleaned, chapter_matches)

    chapter_opening = _summarize_chapter_opening(cleaned, max_len=max_len)
    if chapter_opening:
        return chapter_opening

    if len(chapter_matches) == 2:
        return _summarize_contents_page(cleaned, chapter_matches)

    return _first_complete_sentences(cleaned, max_len=max_len)


def generate_document_page_frames(
    *,
    script: str,
    chapter_id: int,
    duration_minutes: float,
    part_number: int = 1,
    total_parts: int = 1,
    total_seconds: float | None = None,
) -> list[dict]:
    """Build visual frames from chapter-mapped textbook pages, synced in page order."""
    pages = get_chapter_pages(chapter_id)
    if not pages:
        return []

    if total_parts > 1:
        chunk_size = max(1, (len(pages) + total_parts - 1) // total_parts)
        start = (part_number - 1) * chunk_size
        pages = pages[start : start + chunk_size]
        if not pages:
            return []

    if total_seconds is None:
        total_seconds = max(
            duration_minutes * 60,
            len(script.split()) / settings.words_per_minute * 60,
        )
    total_seconds = max(total_seconds, len(pages) * 3)

    script_segments = split_script_into_segments(script, max_segments=len(pages))
    if len(script_segments) < len(pages):
        while len(script_segments) < len(pages):
            script_segments.append(script_segments[-1] if script_segments else script[:500])
    script_segments = script_segments[: len(pages)]

    page_duration = total_seconds / len(pages)
    frames: list[dict] = []
    for index, page in enumerate(pages, start=1):
        segment = script_segments[index - 1]
        start_seconds = (index - 1) * page_duration
        duration_seconds = page_duration if index < len(pages) else max(total_seconds - start_seconds, 1.0)
        page_summary = summarize_page_text(page.text_content)
        caption = page_summary or f"Textbook page {page.page_number}"
        if len(caption) > 480:
            caption = caption[:477].rstrip() + "..."
        frames.append(
            {
                "frame_number": index,
                "caption": caption,
                "segment_text": segment,
                "image_path": page.image_path,
                "start_seconds": round(start_seconds, 2),
                "duration_seconds": round(duration_seconds, 2),
                "book_page_number": page.page_number,
                "source_type": "document",
            }
        )

    logger.info("Built %s document page frame(s) for chapter %s", len(frames), chapter_id)
    return frames
