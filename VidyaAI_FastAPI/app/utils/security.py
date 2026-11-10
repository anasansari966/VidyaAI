from datetime import datetime, timedelta
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.book import Book, Chapter
from app.utils.program_access import book_visible_to_user
from app.models.user import User, UserRole, AccountStatus
from app.models.school import School

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def decode_token(token: str, *, expected_type: str | None = None) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    token_type = payload.get("type")
    if expected_type == "refresh":
        if token_type != "refresh":
            raise JWTError("not a refresh token")
    elif expected_type == "access":
        # Accept legacy tokens that omit type.
        if token_type not in (None, "access"):
            raise JWTError("not an access token")
    return payload


def issue_token_pair(user_id: int) -> tuple[str, str]:
    claims = {"sub": str(user_id)}
    return create_access_token(claims), create_refresh_token(claims)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Send Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()
    try:
        payload = decode_token(token, expected_type="access")
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise JWTError("missing sub")
        user_id = int(user_id_raw)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found. Your session may be outdated — log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        if user.account_status == AccountStatus.SERVICE_STOPPED.value:
            raise HTTPException(status_code=403, detail="Service has been stopped for this account")
        raise HTTPException(status_code=403, detail="Account is suspended")
    return user


def require_roles(*roles: UserRole):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"This action requires one of: {', '.join(r.value for r in roles)}",
            )
        return user

    return checker


def require_school_admin(user: User = Depends(get_current_user)) -> User:
    """Domain admin for book/chapter management (super admin excluded)."""
    if user.role == UserRole.ADMIN:
        if not user.school_id:
            raise HTTPException(status_code=400, detail="Admin must belong to a school")
        return user
    raise HTTPException(status_code=403, detail="School admin required")


def require_domain_admin(user: User = Depends(get_current_user)) -> User:
    """School-scoped admin only — super admin cannot manage students or school ops."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="School admin required")
    if not user.school_id:
        raise HTTPException(status_code=400, detail="Admin must belong to a school")
    return user


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin required")
    return user


def resolve_tenant_school_id(
    user: User,
    db: Session,
    school_id: int | None,
    *,
    required: bool = True,
) -> int | None:
    """Resolve which school a tenant-scoped action applies to."""
    if user.role == UserRole.SUPER_ADMIN:
        if school_id is None:
            if required:
                raise HTTPException(status_code=400, detail="school_id is required")
            return None
        if not db.query(School).filter(School.id == school_id).first():
            raise HTTPException(status_code=404, detail="School not found")
        return school_id
    if user.role == UserRole.ADMIN:
        if not user.school_id:
            raise HTTPException(status_code=400, detail="Admin has no school")
        return user.school_id
    raise HTTPException(status_code=403, detail="Admin or super admin required")


def get_tenant_scope(
    school_id: Annotated[int | None, Query(description="Required for super admin on school-scoped actions")] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[User, int]:
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin cannot perform school operations")
    resolved = resolve_tenant_school_id(user, db, school_id, required=True)
    assert resolved is not None
    return user, resolved


def get_tenant_scope_optional(
    school_id: Annotated[int | None, Query()] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[User, int | None]:
    if user.role == UserRole.STUDENT:
        return user, user.school_id
    resolved = resolve_tenant_school_id(user, db, school_id, required=False)
    if user.role == UserRole.ADMIN:
        if not user.school_id:
            raise HTTPException(status_code=400, detail="Admin has no school")
        return user, user.school_id
    if user.role == UserRole.SUPER_ADMIN:
        return user, resolved
    raise HTTPException(status_code=403, detail="Admin required")


def get_chapter_for_user(db: Session, chapter_id: int, user: User) -> Chapter | None:
    q = db.query(Chapter).join(Book).filter(Chapter.id == chapter_id)
    if user.role in (UserRole.ADMIN, UserRole.STUDENT):
        if not user.school_id:
            return None
        q = q.filter(Book.school_id == user.school_id)
    chapter = q.first()
    if chapter and user.role == UserRole.STUDENT and not book_visible_to_user(chapter.book, user):
        return None
    return chapter


def get_lecture_part_for_user(db: Session, lecture_id: int, user: User):
    from app.models.book import LecturePart

    q = (
        db.query(LecturePart)
        .join(Chapter)
        .join(Book)
        .filter(LecturePart.id == lecture_id)
    )
    if user.role in (UserRole.ADMIN, UserRole.STUDENT):
        if not user.school_id:
            return None
        q = q.filter(Book.school_id == user.school_id)
    lecture = q.first()
    if lecture and user.role == UserRole.STUDENT and not book_visible_to_user(lecture.chapter.book, user):
        return None
    return lecture


def get_user_from_token(token: str, db: Session) -> User:
    """Validate a raw JWT string (e.g. audio query param)."""
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token.strip())
    return get_current_user(credentials, db)


def get_current_user_bearer_or_query(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    token: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
) -> User:
    """Auth via Authorization header or ?token= for media players."""
    if credentials and credentials.credentials:
        return get_current_user(credentials, db)
    if token:
        return get_user_from_token(token, db)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Send Bearer token or ?token=",
        headers={"WWW-Authenticate": "Bearer"},
    )
