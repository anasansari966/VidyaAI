import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.school import School
from app.models.user import User, UserRole

DEFAULT_CLASSES = list(range(1, 13))


def parse_enabled_classes(school: School | None) -> list[int]:
    if not school or not school.enabled_class_grades_json:
        return DEFAULT_CLASSES.copy()
    try:
        raw = json.loads(school.enabled_class_grades_json)
        if isinstance(raw, list) and raw:
            return sorted({int(x) for x in raw if str(x).isdigit() or isinstance(x, int)})
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return DEFAULT_CLASSES.copy()


def parse_student_limits(school: School | None) -> dict[int, int]:
    if not school or not school.student_limits_json:
        return {}
    try:
        raw = json.loads(school.student_limits_json)
        if isinstance(raw, dict):
            return {int(k): int(v) for k, v in raw.items() if str(k).isdigit() and int(v) > 0}
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return {}


def dumps_enabled_classes(classes: list[int]) -> str:
    return json.dumps(sorted({int(c) for c in classes if 1 <= int(c) <= 12}))


def dumps_student_limits(limits: dict[int, int]) -> str:
    cleaned = {str(k): int(v) for k, v in limits.items() if 1 <= int(k) <= 12 and int(v) > 0}
    return json.dumps(cleaned)


def count_students_in_class(db: Session, school_id: int, class_grade: int) -> int:
    return (
        db.query(User)
        .filter(
            User.school_id == school_id,
            User.role == UserRole.STUDENT,
            User.class_grade == class_grade,
        )
        .count()
    )


def assert_class_allowed(school: School, class_grade: int | None) -> None:
    if class_grade is None:
        return
    enabled = parse_enabled_classes(school)
    if class_grade not in enabled:
        raise HTTPException(
            status_code=400,
            detail=f"Class {class_grade} is not enabled for this school. Contact your super admin.",
        )


def assert_student_slot_available(db: Session, school: School, class_grade: int | None) -> None:
    if class_grade is None:
        return
    assert_class_allowed(school, class_grade)
    limits = parse_student_limits(school)
    cap = limits.get(class_grade)
    if cap is None:
        return
    current = count_students_in_class(db, school.id, class_grade)
    if current >= cap:
        raise HTTPException(
            status_code=400,
            detail=f"Class {class_grade} is full ({cap} students). Ask your super admin to increase the limit.",
        )
