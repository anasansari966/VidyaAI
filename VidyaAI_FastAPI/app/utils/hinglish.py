"""School-style Devanagari → Hinglish (Latin) for board / classroom text."""

from __future__ import annotations

import re

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]+")

# Independent vowels
_VOWELS = {
    "अ": "a",
    "आ": "aa",
    "इ": "i",
    "ई": "ee",
    "उ": "u",
    "ऊ": "oo",
    "ऋ": "ri",
    "ए": "e",
    "ऐ": "ai",
    "ओ": "o",
    "औ": "au",
    "ऍ": "e",
    "ऑ": "o",
}

# Matras (dependent vowels)
_MATRAS = {
    "ा": "aa",
    "ि": "i",
    "ी": "ee",
    "ु": "u",
    "ू": "oo",
    "ृ": "ri",
    "े": "e",
    "ै": "ai",
    "ो": "o",
    "ौ": "au",
    "ॅ": "e",
    "ॉ": "o",
}

# Consonants (inherent 'a' unless virama / matra follows)
_CONSONANTS = {
    "क": "k",
    "ख": "kh",
    "ग": "g",
    "घ": "gh",
    "ङ": "ng",
    "च": "ch",
    "छ": "chh",
    "ज": "j",
    "झ": "jh",
    "ञ": "ny",
    "ट": "t",
    "ठ": "th",
    "ड": "d",
    "ढ": "dh",
    "ण": "n",
    "त": "t",
    "थ": "th",
    "द": "d",
    "ध": "dh",
    "न": "n",
    "प": "p",
    "फ": "ph",
    "ब": "b",
    "भ": "bh",
    "म": "m",
    "य": "y",
    "र": "r",
    "ल": "l",
    "व": "v",
    "श": "sh",
    "ष": "sh",
    "स": "s",
    "ह": "h",
    "क्ष": "ksh",
    "ज्ञ": "gy",
    "त्र": "tr",
    "श्र": "shr",
    "ड़": "d",
    "ढ़": "dh",
}

_NUKTA = {
    "क़": "q",
    "ख़": "kh",
    "ग़": "g",
    "ज़": "z",
    "फ़": "f",
    "ड़": "d",
    "ढ़": "dh",
}

_DIGITS = {
    "०": "0",
    "१": "1",
    "२": "2",
    "३": "3",
    "४": "4",
    "५": "5",
    "६": "6",
    "७": "7",
    "८": "8",
    "९": "9",
}

_VIRAMA = "्"
_ANUSVARA = "ं"
_CHANDRABINDU = "ँ"
_VISARGA = "ः"


def contains_devanagari(text: str | None) -> bool:
    return bool(DEVANAGARI_RE.search(text or ""))


def _transliterate_word(chunk: str) -> str:
    out: list[str] = []
    i = 0
    n = len(chunk)
    while i < n:
        ch = chunk[i]

        if ch in _DIGITS:
            out.append(_DIGITS[ch])
            i += 1
            continue

        if ch in _VOWELS:
            out.append(_VOWELS[ch])
            i += 1
            continue

        # Two-char conjuncts / nukta forms
        digraph = chunk[i : i + 2]
        if digraph in _NUKTA:
            base = _NUKTA[digraph]
            i += 2
            if i < n and chunk[i] == _VIRAMA:
                out.append(base)
                i += 1
            elif i < n and chunk[i] in _MATRAS:
                out.append(base + _MATRAS[chunk[i]])
                i += 1
            else:
                out.append(base + "a")
            continue

        if digraph in ("क्ष", "ज्ञ", "त्र", "श्र") or digraph in _CONSONANTS:
            # handled below via single + virama patterns; try known digraphs first
            pass

        if digraph in ("क्ष", "ज्ञ", "त्र", "श्र"):
            base = _CONSONANTS[digraph]
            i += 2
            if i < n and chunk[i] == _VIRAMA:
                out.append(base)
                i += 1
            elif i < n and chunk[i] in _MATRAS:
                out.append(base + _MATRAS[chunk[i]])
                i += 1
            else:
                out.append(base + "a")
            continue

        if ch in _CONSONANTS:
            base = _CONSONANTS[ch]
            i += 1
            if i < n and chunk[i] == _VIRAMA:
                out.append(base)
                i += 1
            elif i < n and chunk[i] in _MATRAS:
                out.append(base + _MATRAS[chunk[i]])
                i += 1
            else:
                out.append(base + "a")
            continue

        if ch in _MATRAS:
            # orphan matra
            out.append(_MATRAS[ch])
            i += 1
            continue

        if ch == _ANUSVARA or ch == _CHANDRABINDU:
            out.append("n")
            i += 1
            continue

        if ch == _VISARGA:
            out.append("h")
            i += 1
            continue

        if ch == _VIRAMA:
            i += 1
            continue

        # Keep Latin / punctuation / digits as-is
        out.append(ch)
        i += 1

    return "".join(out)


def to_hinglish(text: str | None) -> str:
    """
    Convert Devanagari runs to Hinglish roman letters.
    Non-Hindi text is left unchanged. Safe for equations and mixed lines.
    """
    raw = (text or "").strip()
    if not raw or not contains_devanagari(raw):
        return raw

    parts: list[str] = []
    last = 0
    for match in DEVANAGARI_RE.finditer(raw):
        if match.start() > last:
            parts.append(raw[last : match.start()])
        parts.append(_transliterate_word(match.group(0)))
        last = match.end()
    if last < len(raw):
        parts.append(raw[last:])

    result = "".join(parts)
    result = re.sub(r"\s+", " ", result).strip()
    result = re.sub(r"aa+", "aa", result)
    # Light schwa tidy for classroom Hinglish readability
    result = re.sub(r"\bpara\b", "par", result, flags=re.I)
    result = re.sub(r"milate\b", "milte", result, flags=re.I)
    result = re.sub(r"sabhee\b", "sabhi", result, flags=re.I)
    result = re.sub(r"\bhamen\b", "hamein", result, flags=re.I)
    result = re.sub(r"\bhamaen\b", "hamein", result, flags=re.I)
    return result
