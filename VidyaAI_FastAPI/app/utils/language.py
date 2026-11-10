"""Content / lecture language helpers for multilingual books and notes."""

from __future__ import annotations

import re
from typing import Any

_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_ARABIC = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")
_LATIN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")

# value used in admin UI / generate API → (bcp code, polly voice, display label)
LECTURE_LANGUAGE_MAP: dict[str, tuple[str, str, str]] = {
    "english": ("en-IN", "Kajal", "English"),
    "hindi": ("hi-IN", "Aditi", "Hindi"),
    "hinglish": ("hi-IN", "Kajal", "Hinglish"),
    "french": ("fr-FR", "Lea", "French"),
    "urdu": ("ur-IN", "Aditi", "Urdu"),
    "sanskrit": ("sa-IN", "Aditi", "Sanskrit"),
    "marathi": ("mr-IN", "Aditi", "Marathi"),
}

# Stored book.content_language codes → lecture UI value
CODE_TO_LECTURE: dict[str, str] = {
    "en-IN": "english",
    "en": "english",
    "hi-IN": "hindi",
    "hi": "hindi",
    "fr-FR": "french",
    "fr": "french",
    "ur-IN": "urdu",
    "ur": "urdu",
    "sa-IN": "sanskrit",
    "sa": "sanskrit",
    "mr-IN": "marathi",
    "mr": "marathi",
}

_SUBJECT_HINTS: dict[str, str] = {
    "hindi": "hindi",
    "हिंदी": "hindi",
    "हिन्दी": "hindi",
    "sanskrit": "sanskrit",
    "संस्कृत": "sanskrit",
    "urdu": "urdu",
    "اردو": "urdu",
    "marathi": "marathi",
    "मराठी": "marathi",
    "french": "french",
    "français": "french",
    "francais": "french",
    "english": "english",
    "mathematics": "english",
    "maths": "english",
    "math": "english",
    "science": "english",
    "physics": "english",
    "chemistry": "english",
    "biology": "english",
}

_FRENCH_MARKERS = re.compile(
    r"\b(le|la|les|des|une|est|sont|avec|pour|dans|chapitre|français|francais)\b",
    re.IGNORECASE,
)


def normalize_lecture_language(value: str | None) -> str:
    key = (value or "english").strip().lower()
    if key in LECTURE_LANGUAGE_MAP:
        return key
    if key in CODE_TO_LECTURE:
        return CODE_TO_LECTURE[key]
    return "english"


def lecture_language_meta(lecture_language: str | None) -> tuple[str, str, str]:
    """Return (content_language_code, polly_voice_id, label)."""
    key = normalize_lecture_language(lecture_language)
    return LECTURE_LANGUAGE_MAP[key]


def lecture_language_from_content_code(code: str | None, subject: str | None = None) -> str:
    if code:
        mapped = CODE_TO_LECTURE.get(code.strip()) or CODE_TO_LECTURE.get(code.strip().split("-")[0])
        if mapped:
            # hi-IN alone is ambiguous (Hindi vs Sanskrit vs Marathi) — prefer subject hint.
            if mapped == "hindi" and subject:
                subject_key = subject.strip().lower()
                for hint, lecture_key in _SUBJECT_HINTS.items():
                    if hint in subject_key and lecture_key in {"sanskrit", "marathi", "urdu", "hindi"}:
                        return lecture_key
            return mapped
    if subject:
        subject_key = subject.strip().lower()
        for hint, lecture_key in _SUBJECT_HINTS.items():
            if hint in subject_key:
                return lecture_key
    return "english"


def detect_content_language(subject: str, sample_text: str) -> tuple[str, str, str]:
    """Return (language_code, polly_voice_id, language_label)."""
    subject_key = (subject or "").strip().lower()
    for hint, lecture_key in _SUBJECT_HINTS.items():
        if hint in subject_key:
            return LECTURE_LANGUAGE_MAP[lecture_key]

    sample = sample_text or ""
    if _ARABIC.search(sample):
        return LECTURE_LANGUAGE_MAP["urdu"]

    deavanagari_count = len(_DEVANAGARI.findall(sample))
    latin_count = len(_LATIN.findall(sample))

    if deavanagari_count > 40 and deavanagari_count >= latin_count // 3:
        # Devanagari without clear subject → Hindi default
        return LECTURE_LANGUAGE_MAP["hindi"]

    if latin_count > 80 and _FRENCH_MARKERS.search(sample[:5000]):
        return LECTURE_LANGUAGE_MAP["french"]

    return LECTURE_LANGUAGE_MAP["english"]


def uses_native_script(lecture_language: str | None) -> bool:
    """True when notes/transcript should keep native script (no Hinglish conversion)."""
    key = normalize_lecture_language(lecture_language)
    return key in {"hindi", "french", "urdu", "sanskrit", "marathi"}


def notes_language_rules(lecture_language: str | None) -> dict[str, Any]:
    """Prompt rules + post-process flags for study/synced notes."""
    key = normalize_lecture_language(lecture_language)
    _, _, label = LECTURE_LANGUAGE_MAP[key]

    if key == "hindi":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Write ALL notes in Hindi using Devanagari script (देवनागरी). "
                "Do NOT romanize Hindi. Keep unavoidable English school terms in English if needed."
            ),
            "convert_hinglish": False,
        }
    if key == "sanskrit":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Write notes primarily in Sanskrit using Devanagari. "
                "Explanations may include simple Hindi/English glosses after Sanskrit lines."
            ),
            "convert_hinglish": False,
        }
    if key == "urdu":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Write notes in Urdu using Arabic/Nastaliq script where possible. "
                "If Arabic script is difficult in JSON, use clear Urdu romanization consistently — "
                "prefer Arabic script."
            ),
            "convert_hinglish": False,
        }
    if key == "french":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Write ALL notes in French. Use correct French spelling and accents. "
                "Keep proper nouns as in the source text."
            ),
            "convert_hinglish": False,
        }
    if key == "marathi":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Write notes in Marathi using Devanagari script. Do not romanize Marathi."
            ),
            "convert_hinglish": False,
        }
    if key == "hinglish":
        return {
            "key": key,
            "label": label,
            "script_rule": (
                "Use Hinglish with English alphabets only (NO Devanagari). "
                "Natural Indian classroom mix."
            ),
            "convert_hinglish": True,
        }
    return {
        "key": "english",
        "label": "English",
        "script_rule": "Write notes in clear Indian English suitable for school students.",
        "convert_hinglish": False,
    }


def maybe_hinglish(text: str, *, lecture_language: str | None) -> str:
    """Apply Hinglish conversion only when that language mode requires it."""
    from app.utils.hinglish import to_hinglish

    if notes_language_rules(lecture_language).get("convert_hinglish"):
        return to_hinglish(text or "")
    return (text or "").strip()
