import re


def clean_chapter_title(chapter_number: int, title: str) -> str:
    """Remove duplicated 'Chapter N' prefix from a stored title."""
    text = (title or "").strip()
    if not text:
        return "Introduction" if chapter_number <= 0 else f"Chapter {chapter_number}"

    if chapter_number > 0:
        text = re.sub(
            rf"^(?:chapter|ch\.?)\s*{chapter_number}\s*[:\.\-\u2013]?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()
        if not text:
            return f"Chapter {chapter_number}"

    if chapter_number <= 0:
        text = re.sub(r"^(introduction|foreword|preface|prologue)\s*[:\.\-\u2013]?\s*", "", text, flags=re.IGNORECASE).strip()
        if not text:
            return "Introduction"

    if text.isupper():
        return text.title()
    return text


def chapter_display_label(
    chapter_number: int,
    title: str,
    source_chapter_number: int | None = None,
) -> str:
    """Prefer the printed textbook chapter number when available."""
    display_number = (
        source_chapter_number
        if source_chapter_number is not None and source_chapter_number > 0
        else chapter_number
    )
    cleaned = clean_chapter_title(display_number, title)
    if display_number <= 0:
        return cleaned or "Introduction"
    if not cleaned or cleaned.lower() == f"chapter {display_number}":
        return f"Chapter {display_number}"
    return f"Chapter {display_number}: {cleaned}"
