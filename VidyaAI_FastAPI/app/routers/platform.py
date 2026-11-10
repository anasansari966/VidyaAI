from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.access_role import AccessRole
from app.models.book import Book, Chapter, LecturePart, LectureSchedule, LectureStatus
from app.models.demo_lead import DemoLead
from app.models.student_lead import StudentLead
from app.models.practice import PracticePaper, PracticeTemplate
from app.models.school import School
from app.models.user import User, UserRole, AccountStatus
from app.schemas.auth import StudentStatusUpdate, UserResponse, user_to_response
from app.schemas.school import SchoolUpdate
from app.services.school_quota_service import (
    dumps_enabled_classes,
    dumps_student_limits,
    parse_enabled_classes,
    parse_student_limits,
)
from app.services.school_deletion_service import delete_school_cascade
from app.utils.program_access import apply_admin_student_scope
from app.utils.security import hash_password, require_super_admin

router = APIRouter(prefix="/api/platform", tags=["platform"])


def _apply_account_status(user: User, status: str, note: str | None = None) -> None:
    user.account_status = status
    user.status_note = note.strip() if note and note.strip() else None
    user.is_active = status == AccountStatus.ACTIVE.value


@router.get("/overview")
def platform_overview(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return {
        "schools": db.query(School).count(),
        "admins": db.query(User).filter(User.role == UserRole.ADMIN).count(),
        "students": db.query(User).filter(User.role == UserRole.STUDENT).count(),
        "books": db.query(Book).count(),
        "chapters": db.query(Chapter).count(),
        "lectures_ready": db.query(LecturePart).filter(LecturePart.status == LectureStatus.READY).count(),
        "schedules": db.query(LectureSchedule).count(),
        "practice_templates": db.query(PracticeTemplate).count(),
        "practice_submissions": db.query(PracticePaper).filter(PracticePaper.submitted_at.isnot(None)).count(),
        "demo_leads": db.query(DemoLead).count(),
        "demo_leads_new": db.query(DemoLead).filter(DemoLead.status == "new").count(),
        "student_leads": db.query(StudentLead).count(),
        "student_leads_new": db.query(StudentLead).filter(StudentLead.status == "registered").count(),
        "suspended_users": db.query(User).filter(User.account_status != AccountStatus.ACTIVE.value).count(),
    }


@router.get("/users", response_model=list[UserResponse])
def list_platform_users(
    school_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    q = db.query(User).filter(User.role == UserRole.ADMIN)
    if school_id is not None:
        q = q.filter(User.school_id == school_id)
    users = q.order_by(User.program, User.full_name).all()
    return [user_to_response(u) for u in users]


@router.patch("/users/{user_id}/status", response_model=UserResponse)
def update_platform_user_status(
    user_id: int,
    data: StudentStatusUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot change super admin status")
    if target.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Super admin can only manage admins")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    _apply_account_status(target, data.account_status, data.status_note)
    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


@router.delete("/users/{user_id}")
def delete_platform_user(
    user_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot delete super admin")
    if target.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Super admin can only manage admins")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    student_q = db.query(User).filter(
        User.school_id == target.school_id,
        User.role == UserRole.STUDENT,
    )
    student_q = apply_admin_student_scope(student_q, target)
    blocked_students = student_q.all()
    status_note = f"Domain admin {target.full_name} ({target.email}) was removed by super admin"
    for student in blocked_students:
        _apply_account_status(student, AccountStatus.SERVICE_STOPPED.value, status_note)

    db.delete(target)
    db.commit()
    return {
        "message": "Admin deleted",
        "user_id": user_id,
        "students_blocked": len(blocked_students),
    }


@router.patch("/schools/{school_id}", response_model=dict)
def update_school(
    school_id: int,
    data: SchoolUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    updates = data.model_dump(exclude_unset=True)
    if "default_access_role_id" in updates and updates["default_access_role_id"] is not None:
        role = db.query(AccessRole).filter(AccessRole.id == updates["default_access_role_id"]).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid access role")
    for field, value in updates.items():
        if field == "enabled_class_grades":
            school.enabled_class_grades_json = dumps_enabled_classes(value)
            continue
        if field == "student_limits":
            school.student_limits_json = dumps_student_limits(value)
            continue
        setattr(school, field, value)
    db.commit()
    db.refresh(school)
    admin_count = db.query(User).filter(User.school_id == school.id, User.role == UserRole.ADMIN).count()
    student_count = db.query(User).filter(User.school_id == school.id, User.role == UserRole.STUDENT).count()
    return {
        "id": school.id,
        "name": school.name,
        "organization_type": school.organization_type,
        "default_access_role_id": school.default_access_role_id,
        "address": school.address,
        "enabled_class_grades": parse_enabled_classes(school),
        "student_limits": parse_student_limits(school),
        "created_at": school.created_at,
        "admin_count": admin_count,
        "student_count": student_count,
    }


@router.delete("/schools/{school_id}")
def delete_school(
    school_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    if school.name == "Demo International School":
        raise HTTPException(
            status_code=400,
            detail="The demo school cannot be deleted. Remove other schools instead.",
        )

    summary = delete_school_cascade(db, school)
    return {
        "message": "School deleted",
        **summary,
    }
