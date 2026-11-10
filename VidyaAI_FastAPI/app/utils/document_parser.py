import re
from pathlib import Path

from pypdf import PdfReader
from docx import Document

from app.utils.chapter_labels import clean_chapter_title

_PAGE_MARKER = re.compile(r"^__(?:EDUVERSE|VIDYAAI)_PAGE_(\d+)__$")

_CHAPTER_HEADING = re.compile(
    r"^(?:chapter|ch\.?)\s*(\d+)\s*(?:[:\.\-\u2013]\s*|\s+)(.*)$",
    re.IGNORECASE,
)
_CHAPTER_HEADING_SHORT = re.compile(r"^(?:chapter|ch\.?)\s*(\d+)\s*$", re.IGNORECASE)
_CHAPTER_HEADING_CAPS = re.compile(
    r"^CHAPTER\s+(\d+)\s*(.*)$",
    re.IGNORECASE,
)
_INTRO_HEADING = re.compile(r"^(introduction|foreword|preface|prologue)\b", re.IGNORECASE)
_TOC_LINE = re.compile(
    r"^(?:chapter|ch\.?)\s*\d+.+\s+\d{1,4}\s*$|^(?:contents|answers)\b",
    re.IGNORECASE,
)
_TOC_REGION = re.compile(r"\b(?:contents|table of contents)\b", re.IGNORECASE)
_TOC_ENTRY = re.compile(
    r"^\s*Chapter\s+(\d+)\s+(.+?)\s+(\d{1,4})\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_TOC_ENTRY_INLINE = re.compile(
    r"Chapter\s+(\d+)\s+([A-Z][A-Z\s\?\-\(\)\,\.\'\&]{2,90}?)\s+(\d{1,4})\b",
    re.IGNORECASE,
)
_METADATA_LINE = re.compile(
    r"^(reprint|first edition|ISBN|copyright|©|all rights reserved|published by|"
    r"ncert|national council|price:|rs\.?\s*\d|science textbook for class|"
    r"subs\.\s*by|constitution|preamble|unity of the nation)",
    re.IGNORECASE,
)
_BAD_TITLE = re.compile(
    r"(?:"
    r"^(?:give|what|how|why|name|state|define|explain|list|describe|identify|"
    r"choose|select|write|draw|calculate|find|show|justify|subs\.|constitution|"
    r"amendment|preamble|forty|science textbook|not to be republished|a diver)"
    r")",
    re.IGNORECASE,
)
_SKIP_TOC_LABEL = re.compile(r"^(answers|foreword|preface|index|appendix)\b", re.IGNORECASE)

_MIN_SECTION_CHARS = 200
_MIN_INTRO_CHARS = 30

_WORD_CHAPTER_NUMBERS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
}
_BODY_CHAPTER_PATTERNS = (
    r"(?:^|\n)\s*Chapter\s+{number}\s+{title}\s*(?:\n|$|\d)",
    r"(?:^|\n)\s*CHAPTER\s+{number}\s*(?:\n|\r\n)\s*{title}\s*(?:\n|$|\d)",
    r"(?:^|\n)\s*Chapter\s+{number}\s*\n\s*{title}\s*(?:\n|$|\d)",
    r"(?:^|\n)\s*Chapter\s+{number}\s+{title}\b",
    r"(?:^|\n)\s*CHAPTER\s+{number}\s*\n\s*{title}\b",
)


from app.services.storage_service import local_read_path
from app.utils.indic_text_normalize import normalize_extracted_text
from app.utils.text_sanitize import sanitize_db_text


def _finalize_extracted_text(text: str | None) -> str:
    """Sanitize for DB + decode legacy Indic font encodings (KrutiDev etc.)."""
    return sanitize_db_text(normalize_extracted_text(text or "")) or ""


def extract_text_from_file(file_path: str, file_type: str) -> str:
    path = Path(file_path)
    if file_type == "pdf":
        reader = PdfReader(path)
        parts: list[str] = []
        for index, page in enumerate(reader.pages, start=1):
            parts.append(f"__VIDYAAI_PAGE_{index}__")
            parts.append(page.extract_text() or "")
        text = "\n".join(parts)
        return _finalize_extracted_text(text)
    if file_type in ("docx", "doc"):
        doc = Document(path)
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return _finalize_extracted_text(text)
    raise ValueError(f"Unsupported file type: {file_type}")


def extract_text_from_storage(ref: str, file_type: str) -> str:
    suffix = ".pdf" if file_type == "pdf" else ".docx"
    with local_read_path(ref, suffix=suffix) as path:
        return extract_text_from_file(str(path), file_type)


def extract_text_from_storage_fast(ref: str, file_type: str, *, max_pdf_pages: int = 45) -> str:
    """Read only the opening pages — enough for TOC/chapter detection in under a minute."""
    if file_type in ("docx", "doc"):
        return extract_text_from_storage(ref, file_type)

    import fitz

    suffix = ".pdf"
    with local_read_path(ref, suffix=suffix) as path:
        doc = fitz.open(str(path))
        try:
            last_index = min(len(doc), max_pdf_pages)
            parts: list[str] = []
            for index in range(last_index):
                page_number = index + 1
                parts.append(f"__VIDYAAI_PAGE_{page_number}__")
                parts.append(doc.load_page(index).get_text() or "")
            return _finalize_extracted_text("\n".join(parts))
        finally:
            doc.close()


def extract_pdf_text_range(ref: str, start_page: int, end_page: int) -> str:
    """Extract text from an inclusive 1-based PDF page range."""
    if start_page < 1 or end_page < start_page:
        return ""

    import fitz

    with local_read_path(ref, suffix=".pdf") as path:
        doc = fitz.open(str(path))
        try:
            if start_page > len(doc):
                return ""
            last_index = min(end_page, len(doc)) - 1
            parts: list[str] = []
            for index in range(start_page - 1, last_index + 1):
                page_number = index + 1
                parts.append(f"__VIDYAAI_PAGE_{page_number}__")
                parts.append(doc.load_page(index).get_text() or "")
            return _finalize_extracted_text("\n".join(parts))
        finally:
            doc.close()


def pdf_page_count(ref: str) -> int:
    import fitz

    with local_read_path(ref, suffix=".pdf") as path:
        doc = fitz.open(str(path))
        try:
            return len(doc)
        finally:
            doc.close()


def _significant_title_tokens(title: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", title.lower())
    stop = {"chapter", "unit", "the", "and", "for", "in", "of", "a", "an", "to", "with"}
    return [w for w in words if len(w) > 2 and w not in stop][:6]


def page_text_matches_chapter_start(text: str, chapter_number: int, title: str) -> bool:
    if not text.strip():
        return False
    if not re.search(
        rf"(?:^|\n)\s*(?:chapter|ch\.?)\s*{chapter_number}\b",
        text,
        re.IGNORECASE | re.MULTILINE,
    ):
        return False
    tokens = _significant_title_tokens(title)
    if not tokens:
        return True
    body = re.sub(r"\s+", " ", text.lower())
    hits = sum(1 for token in tokens if token in body)
    required = 1 if len(tokens) == 1 else min(2, len(tokens))
    return hits >= required


def find_chapter_start_page_in_pdf(
    file_ref: str,
    chapter_number: int,
    title: str,
    *,
    search_from: int = 1,
) -> int | None:
    """Locate the PDF page where a chapter body begins."""
    import fitz

    with local_read_path(file_ref, suffix=".pdf") as path:
        doc = fitz.open(str(path))
        try:
            for index in range(max(0, search_from - 1), len(doc)):
                text = _finalize_extracted_text(doc.load_page(index).get_text() or "")
                if _looks_like_toc_block(text):
                    continue
                if len(text.strip()) < 250 and re.search(
                    rf"^\s*Chapter\s+{chapter_number}\s+.+\s+\d{{1,4}}\s*$",
                    text,
                    re.IGNORECASE | re.MULTILINE,
                ):
                    continue
                if page_text_matches_chapter_start(text, chapter_number, title):
                    return index + 1

            tokens = _significant_title_tokens(title)
            if len(tokens) >= 2:
                for index in range(max(0, search_from - 1), len(doc)):
                    text = _finalize_extracted_text(doc.load_page(index).get_text() or "")
                    if _looks_like_toc_block(text):
                        continue
                    body = re.sub(r"\s+", " ", text.lower())
                    if sum(1 for token in tokens if token in body) >= min(2, len(tokens)):
                        if re.search(r"(?:chapter|ch\.?)\s+\d+\b", text, re.IGNORECASE):
                            return index + 1
        finally:
            doc.close()
    return None


def resolve_chapter_pdf_ranges(
    file_ref: str,
    chapters: list[dict],
    *,
    total_pages: int | None = None,
) -> None:
    """
    Fill reliable pdf_start_page / pdf_end_page for every chapter by scanning the full PDF.
    TOC/AI page numbers are often printed book pages — scanning avoids missing later chapters.
    """
    if not chapters:
        return

    if total_pages is None:
        total_pages = pdf_page_count(file_ref)

    first = chapters[0]
    first_start = first.get("pdf_start_page")
    if first_start is not None:
        try:
            printed = int(first_start)
        except (TypeError, ValueError):
            printed = None
        if printed is not None and printed <= 20:
            found = find_chapter_start_page_in_pdf(
                file_ref,
                int(first.get("chapter_number") or 1),
                str(first.get("title") or ""),
                search_from=1,
            )
            if found is not None:
                offset = found - printed
                if 0 < offset <= 40:
                    for ch in chapters:
                        if ch.get("pdf_start_page") is not None:
                            ch["pdf_start_page"] = int(ch["pdf_start_page"]) + offset
                        if ch.get("pdf_end_page") is not None:
                            ch["pdf_end_page"] = int(ch["pdf_end_page"]) + offset

    search_from = 1
    for ch in chapters:
        number = int(ch.get("chapter_number") or 0)
        title = str(ch.get("title") or "")
        found = find_chapter_start_page_in_pdf(
            file_ref, number, title, search_from=search_from
        )
        if found:
            ch["pdf_start_page"] = found
            search_from = found + 1
            continue

        existing = ch.get("pdf_start_page")
        if existing is not None:
            start = int(existing)
            if search_from <= start <= total_pages:
                search_from = start + 1
            else:
                ch["pdf_start_page"] = None

    for index, ch in enumerate(chapters):
        start = ch.get("pdf_start_page")
        if not start:
            continue
        start = int(start)
        next_start = next(
            (
                int(item["pdf_start_page"])
                for item in chapters[index + 1 :]
                if item.get("pdf_start_page")
            ),
            None,
        )
        if next_start and next_start > start:
            ch["pdf_end_page"] = next_start - 1
        else:
            end = ch.get("pdf_end_page")
            if end is None or int(end) < start:
                ch["pdf_end_page"] = total_pages
            else:
                ch["pdf_end_page"] = min(int(end), total_pages)


def extract_toc_snippet(full_text: str, *, max_chars: int = 7000) -> str:
    """Send only the table-of-contents / front matter to AI — not the full book."""
    if not full_text:
        return ""
    match = _TOC_REGION.search(full_text)
    if match:
        start = max(0, match.start() - 500)
        return full_text[start : start + max_chars].strip()
    return full_text[:max_chars].strip()


def slice_text_by_page_range(full_text: str, start_page: int | None, end_page: int | None) -> str:
    if not full_text or not start_page or not end_page or start_page > end_page:
        return ""
    lines = full_text.splitlines()
    parts: list[str] = []
    current_page = 1
    capture = False
    for line in lines:
        marker = _PAGE_MARKER.match(line.strip())
        if marker:
            current_page = int(marker.group(1))
            capture = start_page <= current_page <= end_page
            continue
        if capture:
            parts.append(line)
    return _finalize_extracted_text("\n".join(parts).strip())


def enrich_chapter_content(full_text: str, chapters: list[dict]) -> list[dict]:
    """Fill chapter bodies from marked page ranges in extracted text."""
    enriched: list[dict] = []
    for ch in chapters:
        item = dict(ch)
        if not (item.get("content") or "").strip():
            sliced = slice_text_by_page_range(
                full_text,
                item.get("pdf_start_page"),
                item.get("pdf_end_page"),
            )
            if sliced:
                item["content"] = sliced[:50000]
        enriched.append(item)
    return enriched

def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _flex_title_pattern(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", title.strip())
    return re.escape(cleaned).replace(r"\ ", r"\s+")


def _is_valid_chapter_title(title: str) -> bool:
    text = _normalize_whitespace(title)
    if len(text) < 4 or len(text) > 120:
        return False
    if _BAD_TITLE.search(text):
        return False
    if _looks_like_toc_block(text):
        return False
    words = text.split()
    if len(words) == 1 and len(words[0]) < 4:
        return False
    if text.endswith("?") and re.match(
        r"^(?:what|how|why|give|name|state|define|explain|list|describe|identify|"
        r"choose|select|write|draw|calculate|find|show|a|an|the)\b",
        text,
        re.IGNORECASE,
    ):
        return False
    if re.match(r"^\d+\.\s", text):
        return False
    return True


def _split_into_pdf_pages(full_text: str) -> dict[int, str]:
    pages: dict[int, str] = {}
    current: int | None = None
    buffer: list[str] = []

    for line in full_text.split("\n"):
        marker = _PAGE_MARKER.match(line.strip())
        if marker:
            if current is not None:
                pages[current] = "\n".join(buffer).strip()
            current = int(marker.group(1))
            buffer = []
            continue
        buffer.append(line)

    if current is not None:
        pages[current] = "\n".join(buffer).strip()
    return pages


def _locate_toc_region(full_text: str) -> tuple[int, int] | None:
    match = _TOC_REGION.search(full_text)
    if not match:
        return None
    start = match.start()
    window = full_text[start : start + 4000]
    entry_matches = list(_TOC_ENTRY.finditer(window))
    inline_matches = list(_TOC_ENTRY_INLINE.finditer(window))
    matches = entry_matches or inline_matches
    if matches:
        end = start + matches[-1].end()
    else:
        end = min(len(full_text), start + 1500)
    return start, end


def _body_search_start(full_text: str) -> int:
    region = _locate_toc_region(full_text)
    if not region:
        return len(full_text) // 8
    after_toc = region[1]
    next_page = _PAGE_MARKER.search(full_text, after_toc)
    if next_page:
        return next_page.end() + 1
    return after_toc


def _parse_toc_entries(full_text: str) -> list[dict]:
    region = _locate_toc_region(full_text)
    search_text = full_text[region[0] : region[1]] if region else full_text[:12000]

    entries: dict[int, dict] = {}
    for pattern in (_TOC_ENTRY, _TOC_ENTRY_INLINE):
        for match in pattern.finditer(search_text):
            number = int(match.group(1))
            title = _normalize_whitespace(match.group(2))
            page = int(match.group(3))
            if _SKIP_TOC_LABEL.match(title):
                continue
            if not _is_valid_chapter_title(title):
                continue
            existing = entries.get(number)
            if existing is None or page < existing["page"]:
                entries[number] = {"number": number, "title": title, "page": page}

    ordered = [entries[n] for n in sorted(entries)]
    if len(ordered) < 3:
        return []

    pages = [item["page"] for item in ordered]
    numbers = [item["number"] for item in ordered]
    if numbers[0] != 1:
        return []
    if len(set(numbers)) != len(numbers):
        return []
    if pages != sorted(pages):
        return []
    return ordered


def _page_looks_like_chapter_start(text: str, number: int, title: str) -> bool:
    if not text.strip():
        return False
    if not re.search(rf"\bchapter\s+{number}\b", text, re.IGNORECASE):
        return False
    title_norm = _normalize_whitespace(title).lower()
    body_norm = _normalize_whitespace(text).lower()
    return title_norm in body_norm


def _detect_printed_page_offset(pdf_pages: dict[int, str], toc_entries: list[dict]) -> int | None:
    if not toc_entries:
        return None
    first = toc_entries[0]
    for pdf_num, text in sorted(pdf_pages.items()):
        if _page_looks_like_chapter_start(text, first["number"], first["title"]):
            return pdf_num - first["page"]
    return None


def _chapters_from_toc_pages(full_text: str, toc_entries: list[dict], max_chapters: int) -> list[dict]:
    pdf_pages = _split_into_pdf_pages(full_text)
    if len(pdf_pages) < 3:
        return []

    offset = _detect_printed_page_offset(pdf_pages, toc_entries)
    if offset is None:
        return []

    max_pdf_page = max(pdf_pages)
    sections: dict[int, dict] = {}

    for index, entry in enumerate(toc_entries[:max_chapters]):
        number = entry["number"]
        start_pdf = entry["page"] + offset
        next_entry = toc_entries[index + 1] if index + 1 < len(toc_entries) else None
        end_pdf = (next_entry["page"] + offset - 1) if next_entry else max_pdf_page
        if start_pdf < 1 or start_pdf > max_pdf_page:
            continue

        end_pdf = min(max(end_pdf, start_pdf), max_pdf_page)
        chunks: list[str] = []
        for pdf_num in range(start_pdf, end_pdf + 1):
            page_text = pdf_pages.get(pdf_num, "").strip()
            if page_text and not _looks_like_toc_block(page_text):
                chunks.append(page_text)

        if number == 1:
            prefix: list[str] = []
            for pdf_num in range(1, start_pdf):
                page_text = pdf_pages.get(pdf_num, "").strip()
                if not page_text or _looks_like_toc_block(page_text):
                    continue
                if _locate_toc_region(page_text):
                    continue
                prefix.append(page_text)
            chunks = prefix + chunks

        content = "\n\n".join(chunks).strip()
        if len(content) < _MIN_SECTION_CHARS:
            continue

        sections[number] = {
            "chapter_number": number,
            "title": clean_chapter_title(number, entry["title"]),
            "content": content[:50000],
            "pdf_start_page": start_pdf,
            "pdf_end_page": end_pdf,
        }

    return _finalize_chapter_list(sections)


def _find_chapter_body_start(full_text: str, number: int, title: str, start: int) -> int | None:
    title_pat = _flex_title_pattern(title)
    patterns = [
        pattern.format(number=number, title=title_pat) for pattern in _BODY_CHAPTER_PATTERNS
    ]

    best: int | None = None
    for pattern in patterns:
        match = re.search(pattern, full_text[start:], re.IGNORECASE | re.MULTILINE)
        if match:
            pos = start + match.start()
            if best is None or pos < best:
                best = pos
    return best


def _chapters_from_toc_titles(full_text: str, toc_entries: list[dict], max_chapters: int) -> list[dict]:
    search_start = _body_search_start(full_text)

    markers: list[tuple[int, int, str]] = []
    cursor = search_start
    for entry in toc_entries[:max_chapters]:
        pos = _find_chapter_body_start(full_text, entry["number"], entry["title"], cursor)
        if pos is None:
            continue
        markers.append((pos, entry["number"], entry["title"]))
        cursor = pos + max(len(entry["title"]), 20)

    if len(markers) < max(2, int(len(toc_entries[:max_chapters]) * 0.4)):
        return []

    return _chapters_from_char_markers(full_text, markers, max_chapters)


def _parse_heading(line: str) -> tuple[int, str] | None:
    stripped = line.strip()
    if not stripped or _TOC_LINE.match(stripped):
        return None

    intro_match = _INTRO_HEADING.match(stripped)
    if intro_match:
        label = intro_match.group(1).title()
        remainder = stripped[intro_match.end() :].strip(" :.-–")
        title = remainder or label
        return 0, title[:200]

    chapter_match = _CHAPTER_HEADING.match(stripped)
    if chapter_match:
        number = int(chapter_match.group(1))
        raw_title = (chapter_match.group(2) or "").strip()
        if raw_title.isdigit() and len(raw_title) <= 4:
            return None
        title = clean_chapter_title(number, raw_title) if raw_title else f"Chapter {number}"
        if not _is_valid_chapter_title(title):
            return None
        return number, title[:200]

    short_match = _CHAPTER_HEADING_SHORT.match(stripped)
    if short_match:
        return None

    caps_match = _CHAPTER_HEADING_CAPS.match(stripped)
    if caps_match:
        number = int(caps_match.group(1))
        raw_title = (caps_match.group(2) or "").strip()
        title = clean_chapter_title(number, raw_title) if raw_title else f"Chapter {number}"
        if not _is_valid_chapter_title(title):
            return None
        return number, title[:200]

    return None


def _looks_like_toc_block(content: str) -> bool:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if len(lines) < 4:
        return False
    toc_hits = sum(1 for line in lines if _TOC_LINE.match(line))
    chapter_list_hits = len(_TOC_ENTRY.findall("\n".join(lines)))
    return toc_hits >= max(3, len(lines) // 2) or chapter_list_hits >= 4


def _is_mostly_front_matter(content: str) -> bool:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        return True
    meta_hits = sum(
        1
        for line in lines
        if _METADATA_LINE.match(line) or re.match(r"^(Reprint|First Edition|\d{4}-\d{2})", line, re.I)
    )
    return meta_hits >= max(2, len(lines) // 3)


def _merge_intro_into_chapter_one(sections: dict[int, dict]) -> dict[int, dict]:
    if 0 not in sections:
        return sections

    intro = sections.pop(0)
    intro_content = intro["content"].strip()
    if not intro_content:
        return sections

    if 1 in sections:
        sections[1]["content"] = f"{intro_content}\n\n{sections[1]['content']}".strip()[:50000]
        intro_start = intro.get("pdf_start_page")
        if intro_start:
            current_start = sections[1].get("pdf_start_page")
            sections[1]["pdf_start_page"] = min(intro_start, current_start) if current_start else intro_start
        return sections

    sections[1] = {
        "chapter_number": 1,
        "title": clean_chapter_title(1, intro["title"] if intro["title"] != "Introduction" else ""),
        "content": intro_content[:50000],
    }
    return sections


def _finalize_chapter_list(sections: dict[int, dict]) -> list[dict]:
    """Keep printed TOC/heading chapter numbers — do not resequence to 1..N.

    Resequencing breaks PDF body scans (looking for "Chapter 3" when the book
    actually printed "Chapter 4") and misaligns multi-book uploads.
    """
    merged = _merge_intro_into_chapter_one(sections)
    ordered = sorted(merged.values(), key=lambda item: item["chapter_number"])
    # Prefer positive chapter numbers; keep a single intro (0) if that is all we have.
    positive = [item for item in ordered if item["chapter_number"] > 0]
    if not positive:
        positive = ordered

    finalized: list[dict] = []
    seen: set[int] = set()
    for item in positive:
        number = int(item["chapter_number"])
        if number in seen:
            continue
        seen.add(number)
        finalized.append(
            {
                "chapter_number": number,
                "source_chapter_number": number,
                "title": clean_chapter_title(number, item["title"]),
                "content": item["content"],
                "pdf_start_page": item.get("pdf_start_page"),
                "pdf_end_page": item.get("pdf_end_page"),
            }
        )
    return finalized


def attach_pdf_page_ranges(full_text: str, chapters: list[dict]) -> list[dict]:
    """Fill pdf_start_page/pdf_end_page for chapters that don't have TOC ranges."""
    marker_positions: list[tuple[int, int]] = []
    for match in _PAGE_MARKER.finditer(full_text):
        marker_positions.append((match.start(), int(match.group(1))))
    if not marker_positions:
        return chapters

    def char_to_page(char_pos: int) -> int:
        page = marker_positions[0][1]
        for pos, number in marker_positions:
            if pos <= char_pos:
                page = number
            else:
                break
        return page

    for chapter in chapters:
        if chapter.get("pdf_start_page") and chapter.get("pdf_end_page"):
            continue
        snippet = (chapter.get("content") or "")[:240].strip()
        if not snippet:
            continue
        start_idx = full_text.find(snippet)
        if start_idx < 0:
            continue
        end_idx = min(len(full_text), start_idx + len(chapter.get("content") or ""))
        chapter["pdf_start_page"] = char_to_page(start_idx)
        chapter["pdf_end_page"] = char_to_page(end_idx)
    return chapters


def _chapters_from_char_markers(
    full_text: str,
    markers: list[tuple[int, int, str]],
    max_chapters: int = 30,
) -> list[dict]:
    if not markers:
        return []

    sections: dict[int, dict] = {}
    first_start = markers[0][0]
    if first_start > 0:
        intro_content = full_text[:first_start].strip()
        if intro_content:
            sections[0] = {
                "chapter_number": 0,
                "title": "Introduction",
                "content": intro_content[:50000],
            }

    for index, (start, number, title) in enumerate(markers[:max_chapters]):
        end = markers[index + 1][0] if index + 1 < len(markers) else len(full_text)
        content = full_text[start:end].strip()
        if len(content) < _MIN_SECTION_CHARS or _looks_like_toc_block(content):
            continue
        clean_title = clean_chapter_title(number, title)
        if not _is_valid_chapter_title(clean_title) and number > 0:
            continue
        if number in sections:
            sections[number]["content"] = f"{sections[number]['content']}\n\n{content}".strip()[:50000]
            continue
        sections[number] = {
            "chapter_number": number,
            "title": clean_title,
            "content": content[:50000],
        }

    return _finalize_chapter_list(sections)


def _chapters_from_headings(full_text: str, max_chapters: int) -> list[dict]:
    lines = full_text.split("\n")
    markers: list[tuple[int, int, str]] = []

    for index, line in enumerate(lines):
        parsed = _parse_heading(line)
        if parsed is None:
            continue
        number, title = parsed
        if number <= 0:
            continue
        if markers and markers[-1][1] == number:
            continue
        markers.append((index, number, title))

    if not markers:
        return []

    sections: dict[int, dict] = {}
    first_chapter_index = markers[0][0]
    if first_chapter_index > 0:
        intro_content = "\n".join(lines[:first_chapter_index]).strip()
        if intro_content:
            sections[0] = {
                "chapter_number": 0,
                "title": "Introduction",
                "content": intro_content[:50000],
            }

    for marker_index, (line_index, number, title) in enumerate(markers):
        next_line = markers[marker_index + 1][0] if marker_index + 1 < len(markers) else len(lines)
        content = "\n".join(lines[line_index:next_line]).strip()
        if len(content) < _MIN_SECTION_CHARS or _looks_like_toc_block(content):
            continue
        if number in sections:
            sections[number]["content"] = f"{sections[number]['content']}\n\n{content}".strip()[:50000]
            continue
        sections[number] = {
            "chapter_number": number,
            "title": clean_chapter_title(number, title),
            "content": content[:50000],
        }

    return _finalize_chapter_list(sections)[:max_chapters]


def suggest_chapters_from_text(full_text: str, max_chapters: int = 30) -> list[dict]:
    """
    Build numbered chapters from textbook structure.
    Prefers the Table of Contents (NCERT-style), then body headings.
    Introduction / foreword is merged into Chapter 1.
    """
    toc_entries = _parse_toc_entries(full_text)
    if toc_entries:
        candidates = [
            _chapters_from_toc_pages(full_text, toc_entries, max_chapters),
            _chapters_from_toc_titles(full_text, toc_entries, max_chapters),
        ]
        best = max(candidates, key=len)
        if len(best) >= max(2, int(len(toc_entries) * 0.4)):
            return best[:max_chapters]

    heading_chapters = _chapters_from_headings(full_text, max_chapters)
    if heading_chapters:
        return heading_chapters

    if full_text.strip():
        return [
            {
                "chapter_number": 1,
                "title": "Full Book",
                "content": full_text.strip()[:50000],
            }
        ]
    return []
