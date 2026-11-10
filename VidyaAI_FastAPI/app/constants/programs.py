"""Fixed program presets — no admin configuration required."""

from typing import Literal

Program = Literal["school", "jee", "neet", "govt"]

PROGRAMS: list[Program] = ["school", "jee", "neet", "govt"]

PROGRAM_LABELS: dict[str, str] = {
    "school": "School (Class 1–12)",
    "jee": "JEE",
    "neet": "NEET",
    "govt": "Govt Exams",
}

PROGRAM_SHORT: dict[str, str] = {
    "school": "School",
    "jee": "JEE",
    "neet": "NEET",
    "govt": "Govt Exams",
}

# Legacy value from early builds
LEGACY_TRACK_MAP: dict[str, str] = {
    "competitive": "jee",
}


def normalize_program(value: str | None) -> str:
    if not value:
        return "school"
    value = value.strip().lower()
    return LEGACY_TRACK_MAP.get(value, value if value in PROGRAMS else "school")


def is_school_program(program: str | None) -> bool:
    return normalize_program(program) == "school"


def has_schedule(program: str | None) -> bool:
    return is_school_program(program)


def practice_exam_hint(program: str | None) -> str:
    program = normalize_program(program)
    hints = {
        "school": "Focus on NCERT school-level MCQs suitable for class tests.",
        "jee": "Focus on JEE Main-style MCQs with numerical problem-solving and higher difficulty.",
        "neet": "Focus on NEET-style MCQs aligned with NCERT Biology, Chemistry, and Physics.",
        "govt": "Focus on SSC/Banking/Railway-style MCQs: speed, accuracy, and general awareness.",
    }
    return hints.get(program, hints["school"])
