from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.access_role import AccessRole
from app.models.user import User, UserRole
from app.models.school import School
from app.constants.programs import normalize_program
from app.schemas.school import SchoolCreate, SchoolResponse
from app.schemas.auth import UserCreate, UserResponse, user_to_response
from app.services.school_quota_service import (
    dumps_enabled_classes,
    dumps_student_limits,
    parse_enabled_classes,
    parse_student_limits,
)
from app.utils.security import require_roles, hash_password

router = APIRouter(prefix="/api/schools", tags=["schools"])


def _validate_access_role(db: Session, role_id: int) -> AccessRole:
    role = db.query(AccessRole).filter(AccessRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid access role")
    return role


def _school_response(db: Session, school: School) -> SchoolResponse:
    admin_count = db.query(User).filter(User.school_id == school.id, User.role == UserRole.ADMIN).count()
    student_count = db.query(User).filter(User.school_id == school.id, User.role == UserRole.STUDENT).count()
    return SchoolResponse(
        id=school.id,
        name=school.name,
        organization_type=school.organization_type,
        default_access_role_id=school.default_access_role_id,
        address=school.address,
        enabled_class_grades=parse_enabled_classes(school),
        student_limits=parse_student_limits(school),
        created_at=school.created_at,
        admin_count=admin_count,
        student_count=student_count,
    )


@router.get("", response_model=list[SchoolResponse])
def list_schools(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    schools = db.query(School).all()
    return [_school_response(db, s) for s in schools]


@router.post("", response_model=SchoolResponse)
def create_school(
    data: SchoolCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _validate_access_role(db, data.default_access_role_id)
    school = School(
        name=data.name,
        organization_type=data.organization_type,
        default_access_role_id=data.default_access_role_id,
        address=data.address,
        enabled_class_grades_json=dumps_enabled_classes(data.enabled_class_grades),
        student_limits_json=dumps_student_limits(data.student_limits),
    )
    db.add(school)
    db.commit()
    db.refresh(school)
    return _school_response(db, school)


@router.post("/{school_id}/admins", response_model=UserResponse)
def create_admin_for_school(
    school_id: int,
    data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    school = db.query(School).filter(School.id == school_id).first()
    if not school:
        raise HTTPException(status_code=404, detail="School not found")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    program = normalize_program(data.program or school.organization_type)
    if program != normalize_program(school.organization_type):
        raise HTTPException(
            status_code=400,
            detail="Admin domain must match the school's program",
        )

    exam_track = data.exam_track
    if program != "school" and not exam_track:
        from app.utils.program_access import DEFAULT_EXAM_TRACK

        exam_track = DEFAULT_EXAM_TRACK.get(program)

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole.ADMIN,
        school_id=school_id,
        program=program,
        exam_track=exam_track or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_response(user)


@router.get("/public", response_model=list[SchoolResponse])
def list_schools_public(db: Session = Depends(get_db)):
    """For signup dropdown — schools only, no counts."""
    schools = db.query(School).all()
    return [_school_response(db, s) for s in schools]
