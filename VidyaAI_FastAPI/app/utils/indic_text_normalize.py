"""Normalize PDF-extracted text for Indic and multilingual school books.

Indian Hindi/Sanskrit PDFs often use legacy desktop fonts (KrutiDev / DevLys-style)
where glyph codes are Latin ASCII. Extractors return that ASCII, not Unicode
Devanagari. This module detects that case and converts to Unicode.
"""

from __future__ import annotations

import re
from typing import Iterable

from app.utils.krutidev_unicode import kru2uni

_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_ARABIC = re.compile(r"[\u0600-\u06FF]")
_LATIN_WORD = re.compile(r"[A-Za-z]{2,}")

# Strong KrutiDev / DV-TT style fingerprints seen in NCERT Hindi extracts.
_KRUTI_SIGNATURES = (
    "osQ",
    "OsQ",
    "gSA",
    "gSa",
    "esa ",
    "esa\n",
    " dk ",
    "lwj",
    "tUe",
    "vuqlkj",
    "¯g",
    "osQ ",
    "dks ",
    "ugha",
    "fn;k",
    "ds fy,",  # after partial convert — rare
)

_SKIP_LINE = re.compile(
    r"(?i)^\s*(?:"
    r"reprint\s+\d{4}(?:\s*[-–]\s*\d{2,4})?"
    r"|isbn[\d\-x\s]*"
    r"|copyright|©|all rights reserved"
    r"|not to be republished"
    r"|published by|national council|ncert"
    r"|www\.|http"
    r")\s*$"
)

_PAGE_MARKER = re.compile(r"^__(?:EDUVERSE|VIDYAAI)_PAGE_\d+__$")

# Common PDF artifact: osQ used for के (standard KrutiDev uses ds).
_OSQ_FIX = (("osQ", "ds"), ("OsQ", "ds"), ("blosQ", "blds"))


def deavanagari_ratio(text: str) -> float:
    if not text:
        return 0.0
    letters = [c for c in text if c.isalpha() or ("\u0900" <= c <= "\u097F") or ("\u0600" <= c <= "\u06FF")]
    if not letters:
        return 0.0
    dev = sum(1 for c in letters if "\u0900" <= c <= "\u097F")
    return dev / len(letters)


def looks_like_krutidev(text: str) -> bool:
    """True when text is mostly Latin but carries KrutiDev fingerprints."""
    sample = (text or "")[:12000]
    if not sample.strip():
        return False
    if deavanagari_ratio(sample) >= 0.25:
        return False
    if _ARABIC.search(sample) and not _LATIN_WORD.search(sample):
        return False

    latin_words = _LATIN_WORD.findall(sample)
    if len(latin_words) < 8 and len(sample) < 80:
        # Short snippets: require a strong signature.
        return any(sig in sample for sig in ("osQ", "lwj", "gSA", "¯g", "tUe"))

    hits = sum(1 for sig in _KRUTI_SIGNATURES if sig in sample)
    if hits >= 2:
        return True
    if hits >= 1 and len(latin_words) >= 25 and deavanagari_ratio(sample) < 0.05:
        return True
    # Dense Latin with very few English stopwords but Hindi-like syllable noise.
    if len(latin_words) >= 40 and deavanagari_ratio(sample) < 0.02:
        hindi_ish = sum(1 for w in latin_words if re.search(r"[aeiou].*[qQkKgGjJ]", w))
        if hindi_ish >= 8 and hits >= 1:
            return True
    return False


def _should_skip_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if _PAGE_MARKER.match(stripped):
        return True
    if _SKIP_LINE.match(stripped):
        return True
    # Pure ASCII metadata / page numbers.
    if re.fullmatch(r"[\d\s\-–./]+", stripped):
        return True
    return False


def _prepare_krutidev_chunk(chunk: str) -> str:
    text = chunk
    for src, dst in _OSQ_FIX:
        text = text.replace(src, dst)
    return text


def convert_krutidev_text(text: str) -> str:
    """Convert KrutiDev-encoded text to Unicode Devanagari.

    Preserves page markers and English metadata lines.
    """
    if not text:
        return text

    lines = text.splitlines(keepends=True)
    out: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        if not buffer:
            return
        chunk = "".join(buffer)
        buffer = []
        prepared = _prepare_krutidev_chunk(chunk)
        try:
            out.append(kru2uni(prepared))
        except Exception:
            out.append(chunk)

    for line in lines:
        bare = line.rstrip("\r\n")
        if _PAGE_MARKER.match(bare.strip()) or _should_skip_line(bare):
            flush()
            out.append(line)
            continue
        # Keep mostly-English lines (few Kruti fingerprints).
        if (
            len(bare) > 20
            and deavanagari_ratio(bare) < 0.05
            and not any(sig in bare for sig in ("osQ", "gSA", "esa", "dk ", "lwj", "¯", "tUe", "vuq"))
            and len(re.findall(r"\b(?:the|and|of|to|in|for|chapter|page|class)\b", bare, re.I)) >= 2
        ):
            flush()
            out.append(line)
            continue
        buffer.append(line)

    flush()
    return "".join(out)


def strip_pdf_noise(text: str) -> str:
    """Remove repeated reprint footers and empty clutter."""
    if not text:
        return text
    lines = text.splitlines()
    cleaned: list[str] = []
    for line in lines:
        if _SKIP_LINE.match(line.strip()):
            continue
        cleaned.append(line)
    # Collapse 3+ blank lines.
    result = re.sub(r"\n{3,}", "\n\n", "\n".join(cleaned))
    return result.strip()


def normalize_extracted_text(text: str | None) -> str:
    """Main entry: decode legacy Indic encodings + strip PDF noise."""
    if not text:
        return ""
    value = text
    if looks_like_krutidev(value):
        value = convert_krutidev_text(value)
    value = strip_pdf_noise(value)
    return value


def content_looks_garbled_indic(text: str | None) -> bool:
    """True when stored chapter text still needs KrutiDev repair."""
    return looks_like_krutidev(text or "")
