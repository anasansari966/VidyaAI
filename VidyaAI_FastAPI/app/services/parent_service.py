from sqlalchemy.orm import Session

from app.models.parent_student_link import ParentStudentLink
from app.models.user import User, UserRole, AccountStatus
from app.utils.parent_accounts import normalize_phone, parent_login_email
from app.utils.security import hash_password


def get_or_create_parent(
    db: Session,
    *,
    phone: str,
    password: str,
    full_name: str | None,
    school_id: int,
) -> User:
    digits = normalize_phone(phone)
    if not digits:
        raise ValueError("Parent phone number is required")

    email = parent_login_email(digits, school_id)
    parent = (
        db.query(User)
        .filter(
            User.role == UserRole.PARENT,
            User.phone == digits,
            User.school_id == school_id,
        )
        .first()
    )
    if not parent:
        parent = db.query(User).filter(User.email == email).first()

    display_name = full_name.strip() if full_name and full_name.strip() else f"Parent ({digits})"

    if parent:
        parent.hashed_password = hash_password(password)
        parent.phone = digits
        parent.full_name = display_name
        parent.school_id = school_id
        parent.is_active = True
        parent.account_status = AccountStatus.ACTIVE.value
        return parent

    parent = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=display_name,
        role=UserRole.PARENT,
        school_id=school_id,
        phone=digits,
        program="school",
        account_status=AccountStatus.ACTIVE.value,
        is_active=True,
    )
    db.add(parent)
    db.flush()
    return parent


def link_parent_to_student(db: Session, *, parent_id: int, student_id: int) -> None:
    existing = (
        db.query(ParentStudentLink)
        .filter(
            ParentStudentLink.parent_id == parent_id,
            ParentStudentLink.student_id == student_id,
        )
        .first()
    )
    if existing:
        return
    db.add(ParentStudentLink(parent_id=parent_id, student_id=student_id))


def list_parent_students(db: Session, parent: User) -> list[User]:
    return (
        db.query(User)
        .join(ParentStudentLink, ParentStudentLink.student_id == User.id)
        .filter(
            ParentStudentLink.parent_id == parent.id,
            User.role == UserRole.STUDENT,
            User.school_id == parent.school_id,
        )
        .order_by(User.full_name)
        .all()
    )


def parent_can_view_student(db: Session, parent: User, student_id: int) -> User | None:
    return (
        db.query(User)
        .join(ParentStudentLink, ParentStudentLink.student_id == User.id)
        .filter(
            ParentStudentLink.parent_id == parent.id,
            User.id == student_id,
            User.role == UserRole.STUDENT,
            User.school_id == parent.school_id,
        )
        .first()
    )
