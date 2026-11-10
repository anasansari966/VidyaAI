import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.constants.programs import is_school_program, normalize_program
from app.database import get_db
from app.models.access_role import AccessRole
from app.models.school import School
from app.models.user import User, UserRole, AccountStatus
from app.models.book import StudentProgress
from app.schemas.auth import UserCreate, UserResponse, StudentStatusUpdate, StudentAccessRoleUpdate, user_to_response
from app.services.student_import_service import (
    build_credentials_workbook,
    build_template_workbook,
    import_students_from_excel,
)
from app.utils.program_access import apply_admin_student_scope, student_visible_to_admin
from app.services.school_quota_service import assert_class_allowed, assert_student_slot_available
from app.services.parent_service import get_or_create_parent, link_parent_to_student
from app.utils.parent_accounts import normalize_phone
from app.utils.security import hash_password, get_current_user, get_tenant_scope, require_roles

router = APIRouter(prefix="/api/students", tags=["students"])

_USER_LOAD = (
    joinedload(User.access_role),
    joinedload(User.school).joinedload(School.default_access_role),
)


def _apply_account_status(user: User, status: str, note: str | None = None) -> None:
    user.account_status = status
    user.status_note = note.strip() if note and note.strip() else None
    user.is_active = status == AccountStatus.ACTIVE.value


def _get_school_student(db: Session, student_id: int, school_id: int, admin: User) -> User:
    student = (
        db.query(User)
        .filter(
            User.id == student_id,
            User.school_id == school_id,
            User.role == UserRole.STUDENT,
        )
        .first()
    )
    if not student or not student_visible_to_admin(student, admin):
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.post("", response_model=UserResponse)
def create_student(
    data: UserCreate,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope
    program = normalize_program(data.program)

    if normalize_program(actor.program) != program:
        raise HTTPException(status_code=403, detail="You can only create students in your domain")
    if normalize_program(actor.program) != "school" and actor.exam_track:
        if (data.exam_track or "") != actor.exam_track:
            raise HTTPException(status_code=403, detail="Exam track must match your admin domain")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    assert_class_allowed(school, data.class_grade)
    assert_student_slot_available(db, school, data.class_grade)

    access_role_id = data.access_role_id
    if access_role_id is None:
        access_role_id = school.default_access_role_id
    if access_role_id is not None:
        role = db.query(AccessRole).filter(AccessRole.id == access_role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid access role")

    parent_phone = normalize_phone(data.parent_phone) or None
    if parent_phone and not (data.parent_password or "").strip():
        raise HTTPException(status_code=400, detail="Parent password is required when parent phone is provided")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole.STUDENT,
        school_id=school_id,
        class_grade=data.class_grade,
        program=program,
        exam_track=data.exam_track or None,
        access_role_id=access_role_id,
        phone=data.phone,
        parent_name=data.parent_name,
        parent_phone=parent_phone,
        account_status=AccountStatus.ACTIVE.value,
        is_active=True,
    )
    db.add(user)
    db.flush()

    if parent_phone and data.parent_password:
        parent = get_or_create_parent(
            db,
            phone=parent_phone,
            password=data.parent_password.strip(),
            full_name=data.parent_name,
            school_id=school_id,
        )
        link_parent_to_student(db, parent_id=parent.id, student_id=user.id)

    db.commit()
    db.refresh(user)
    loaded = (
        db.query(User)
        .options(*_USER_LOAD)
        .filter(User.id == user.id)
        .first()
    )
    return user_to_response(loaded or user, db)


@router.get("", response_model=list[UserResponse])
def list_students(
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope
    q = db.query(User).filter(User.school_id == school_id, User.role == UserRole.STUDENT)
    q = apply_admin_student_scope(q, actor)
    students = q.options(*_USER_LOAD).order_by(User.full_name).all()
    return [user_to_response(s, db) for s in students]


@router.get("/performance-records")
def list_performance_records(
    class_grade: int | None = None,
    unassigned: bool = False,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    """Bulk student practice/mock records for school admin (optional class filter)."""
    from app.services.parent_report_service import list_admin_student_records

    actor, school_id = scope
    q = db.query(User).filter(User.school_id == school_id, User.role == UserRole.STUDENT)
    q = apply_admin_student_scope(q, actor)
    if unassigned:
        q = q.filter(User.class_grade.is_(None))
    elif class_grade is not None:
        q = q.filter(User.class_grade == class_grade)
    students = q.order_by(User.full_name).all()
    return list_admin_student_records(db, students)


@router.get("/performance-records/classes")
def list_performance_record_classes(
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    """Class cards summary for admin records navigation."""
    from app.services.parent_report_service import list_admin_student_records

    actor, school_id = scope
    q = db.query(User).filter(User.school_id == school_id, User.role == UserRole.STUDENT)
    q = apply_admin_student_scope(q, actor)
    students = q.all()
    rows = list_admin_student_records(db, students)

    buckets: dict[str, dict] = {}
    for row in rows:
        grade = row.get("class_grade")
        key = "unassigned" if grade is None else str(int(grade))
        bucket = buckets.setdefault(
            key,
            {
                "class_grade": grade,
                "key": key,
                "label": "Unassigned" if grade is None else f"Class {grade}",
                "student_count": 0,
                "attempted_count": 0,
                "total_avg": 0.0,
                "top_student": None,
                "top_score": -1.0,
            },
        )
        bucket["student_count"] += 1
        attempts = int(row.get("attempts") or 0)
        avg = float(row.get("avg_score") or 0)
        if attempts > 0:
            bucket["attempted_count"] += 1
            bucket["total_avg"] += avg
            if avg > bucket["top_score"]:
                bucket["top_score"] = avg
                bucket["top_student"] = row.get("full_name")

    classes = []
    for bucket in buckets.values():
        attempted = bucket["attempted_count"]
        classes.append(
            {
                "class_grade": bucket["class_grade"],
                "key": bucket["key"],
                "label": bucket["label"],
                "student_count": bucket["student_count"],
                "attempted_count": attempted,
                "class_avg": round(bucket["total_avg"] / attempted, 1) if attempted else 0.0,
                "top_student": bucket["top_student"],
                "top_score": bucket["top_score"] if bucket["top_score"] >= 0 else None,
            }
        )

    def sort_key(item: dict):
        grade = item.get("class_grade")
        return (1, 999) if grade is None else (0, int(grade))

    classes.sort(key=sort_key)
    return classes


@router.get("/performance-records/class/{class_key}/pdf")
def class_performance_records_pdf(
    class_key: str,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    from app.models.school import School
    from app.services.parent_report_service import build_class_performance_report_pdf

    actor, school_id = scope
    q = db.query(User).filter(User.school_id == school_id, User.role == UserRole.STUDENT)
    q = apply_admin_student_scope(q, actor)
    students = q.order_by(User.full_name).all()
    school = db.query(School).filter(School.id == school_id).first()

    if class_key == "unassigned":
        class_grade = None
    else:
        try:
            class_grade = int(class_key)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid class key")

    pdf_bytes, filename = build_class_performance_report_pdf(
        db,
        students=students,
        class_grade=class_grade,
        school_name=school.name if school else None,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
        },
    )


@router.get("/{student_id}/performance")
def student_performance_detail(
    student_id: int,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    from app.services.student_performance_service import build_student_performance

    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)
    return build_student_performance(db, student)


@router.get("/{student_id}/reports")
def student_reports(
    student_id: int,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    from app.services.parent_report_service import list_student_report_cards

    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)
    return list_student_report_cards(db, student)


@router.get("/{student_id}/reports/overall/pdf")
def student_overall_report_pdf(
    student_id: int,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    from app.services.parent_report_service import build_overall_student_report_pdf

    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)
    pdf_bytes, filename = build_overall_student_report_pdf(db, student)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
        },
    )


@router.get("/{student_id}/reports/{paper_id}/pdf")
def student_paper_report_pdf(
    student_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    from app.services.parent_report_service import build_student_report_pdf

    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)
    try:
        pdf_bytes, filename = build_student_report_pdf(db, student, paper_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
        },
    )


def _load_user_response(db: Session, user_id: int) -> UserResponse:
    loaded = (
        db.query(User)
        .options(*_USER_LOAD)
        .filter(User.id == user_id)
        .first()
    )
    if not loaded:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_response(loaded, db)


@router.patch("/{student_id}/status", response_model=UserResponse)
def update_student_status(
    student_id: int,
    data: StudentStatusUpdate,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)
    _apply_account_status(student, data.account_status, data.status_note)
    db.commit()
    return _load_user_response(db, student.id)


@router.patch("/{student_id}/access-role", response_model=UserResponse)
def update_student_access_role(
    student_id: int,
    data: StudentAccessRoleUpdate,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope
    student = _get_school_student(db, student_id, school_id, actor)

    if data.access_role_id is not None:
        role = db.query(AccessRole).filter(AccessRole.id == data.access_role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid access role")

    student.access_role_id = data.access_role_id
    db.commit()
    return _load_user_response(db, student.id)


class ProgressUpdate(BaseModel):
    lecture_part_id: int
    completed: bool = False
    last_position_seconds: int = 0


@router.post("/progress")
def update_progress(
    data: ProgressUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.STUDENT)),
):
    progress = (
        db.query(StudentProgress)
        .filter(
            StudentProgress.student_id == user.id,
            StudentProgress.lecture_part_id == data.lecture_part_id,
        )
        .first()
    )
    if not progress:
        progress = StudentProgress(
            student_id=user.id,
            lecture_part_id=data.lecture_part_id,
        )
        db.add(progress)

    progress.completed = data.completed
    progress.last_position_seconds = data.last_position_seconds
    db.commit()
    return {"message": "Progress updated"}


@router.get("/import/template")
def download_import_template(
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    _, _ = scope
    content = build_template_workbook()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="vidyaai-student-import-template.xlsx"'},
    )


@router.post("/bulk-import")
async def bulk_import_students(
    file: UploadFile = File(...),
    class_grade: int | None = Form(None),
    access_role_id: int | None = Form(None),
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Upload an Excel file (.xlsx)")

    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    resolved_access_role_id = access_role_id if access_role_id is not None else school.default_access_role_id

    try:
        results, errors = import_students_from_excel(
            db,
            file_bytes=file_bytes,
            school_id=school_id,
            admin_program=actor.program,
            admin_exam_track=actor.exam_track,
            class_grade=class_grade,
            access_role_id=resolved_access_role_id,
            school_name=school.name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not results:
        detail = "; ".join(errors) if errors else "No students were imported"
        raise HTTPException(status_code=400, detail=detail)

    workbook = build_credentials_workbook(results)
    school_slug = re.sub(r"[^a-z0-9]+", "-", school.name.lower()).strip("-") or f"school-{school_id}"
    track_slug = f"class-{class_grade}" if class_grade else (actor.exam_track or actor.program or "import")
    filename = f"vidyaai-credentials-{school_slug}-{track_slug}.xlsx"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Import-Count": str(len(results)),
    }
    if errors:
        headers["X-Import-Warnings"] = "; ".join(errors[:5])
    return Response(
        content=workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
