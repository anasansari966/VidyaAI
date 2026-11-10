from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.constants.programs import normalize_program
from app.database import get_db
from app.models.user import User, UserRole, AccountStatus
from app.models.school import School
from app.schemas.auth import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    RefreshTokenRequest,
    user_to_response,
)
from app.utils.parent_accounts import normalize_phone
from app.utils.security import (
    hash_password,
    verify_password,
    issue_token_pair,
    decode_token,
    get_current_user,
)
from jose import JWTError

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User, db: Session) -> Token:
    access, refresh = issue_token_pair(user.id)
    return Token(
        access_token=access,
        refresh_token=refresh,
        user=user_to_response(user, db),
    )


@router.get("/super-admin-available")
def super_admin_available(db: Session = Depends(get_db)):
    """Whether a new super admin can register (only one allowed)."""
    exists = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
    return {"available": exists is None}


@router.post("/register", response_model=Token)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if data.role == UserRole.SUPER_ADMIN:
        existing_super = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
        if existing_super:
            raise HTTPException(status_code=400, detail="Super admin already exists")

    if data.role in (UserRole.ADMIN, UserRole.STUDENT) and not data.school_id:
        raise HTTPException(status_code=400, detail="school_id required for admin and student")

    program = normalize_program(data.program)
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        school_id=data.school_id,
        class_grade=data.class_grade if data.role == UserRole.STUDENT else None,
        program=program if data.role in (UserRole.ADMIN, UserRole.STUDENT) else "school",
        exam_track=data.exam_track if data.role in (UserRole.ADMIN, UserRole.STUDENT) else None,
        access_role_id=data.access_role_id if data.role == UserRole.STUDENT else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    loaded = (
        db.query(User)
        .options(
            joinedload(User.access_role),
            joinedload(User.school).joinedload(School.default_access_role),
        )
        .filter(User.id == user.id)
        .first()
    )

    return _token_response(loaded or user, db)


@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    login_id = data.email.strip().lower()
    user = (
        db.query(User)
        .options(
            joinedload(User.access_role),
            joinedload(User.school).joinedload(School.default_access_role),
        )
        .filter(User.email == login_id)
        .first()
    )
    if not user:
        phone_digits = normalize_phone(login_id)
        if phone_digits:
            candidates = (
                db.query(User)
                .options(
                    joinedload(User.access_role),
                    joinedload(User.school).joinedload(School.default_access_role),
                )
                .filter(User.role == UserRole.PARENT, User.phone == phone_digits)
                .all()
            )
            user = next(
                (candidate for candidate in candidates if verify_password(data.password, candidate.hashed_password)),
                None,
            )
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if data.role is not None and user.role != data.role:
        raise HTTPException(status_code=401, detail="Invalid role for this account")
    if not user.is_active:
        if user.account_status == AccountStatus.SERVICE_STOPPED.value:
            raise HTTPException(status_code=403, detail="Service has been stopped for this account")
        raise HTTPException(status_code=403, detail="Account is suspended")

    return _token_response(user, db)


@router.post("/refresh", response_model=Token)
def refresh_tokens(data: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token.strip(), expected_type="refresh")
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = (
        db.query(User)
        .options(
            joinedload(User.access_role),
            joinedload(User.school).joinedload(School.default_access_role),
        )
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        if user.account_status == AccountStatus.SERVICE_STOPPED.value:
            raise HTTPException(status_code=403, detail="Service has been stopped for this account")
        raise HTTPException(status_code=403, detail="Account is suspended")

    return _token_response(user, db)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loaded = (
        db.query(User)
        .options(
            joinedload(User.access_role),
            joinedload(User.school).joinedload(School.default_access_role),
        )
        .filter(User.id == user.id)
        .first()
    )
    return user_to_response(loaded or user, db)
