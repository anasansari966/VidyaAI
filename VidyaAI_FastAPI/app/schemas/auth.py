from pydantic import BaseModel, EmailStr, field_validator

from app.constants.programs import normalize_program
from app.constants.service_permissions import DEFAULT_FULL_PERMISSIONS
from app.models.user import User, UserRole, AccountStatus
from app.utils.service_access import resolve_service_permissions


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole
    school_id: int | None = None
    class_grade: int | None = None
    program: str = "school"
    exam_track: str | None = None
    access_role_id: int | None = None
    phone: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_password: str | None = None

    @field_validator("program")
    @classmethod
    def validate_program(cls, value: str) -> str:
        return normalize_program(value)


class UserLogin(BaseModel):
    email: str
    password: str
    role: UserRole | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    school_id: int | None
    class_grade: int | None = None
    program: str = "school"
    exam_track: str | None = None
    is_active: bool
    account_status: str = AccountStatus.ACTIVE.value
    status_note: str | None = None
    access_role_id: int | None = None
    phone: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    service_permissions: list[str] = DEFAULT_FULL_PERMISSIONS
    subscription_plan: str | None = None
    subscription_status: str | None = None
    subscription_expires_at: str | None = None

    class Config:
        from_attributes = True


class StudentStatusUpdate(BaseModel):
    account_status: str
    status_note: str | None = None

    @field_validator("account_status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        allowed = {AccountStatus.ACTIVE.value, AccountStatus.SUSPENDED.value, AccountStatus.SERVICE_STOPPED.value}
        if value not in allowed:
            raise ValueError("Invalid account status")
        return value


class StudentAccessRoleUpdate(BaseModel):
    access_role_id: int | None = None


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


def user_to_response(user: User, db=None) -> UserResponse:
    permissions = resolve_service_permissions(user, db)

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        school_id=user.school_id,
        class_grade=user.class_grade,
        program=user.program,
        exam_track=user.exam_track,
        is_active=user.is_active,
        account_status=user.account_status,
        status_note=user.status_note,
        access_role_id=user.access_role_id,
        phone=user.phone,
        parent_name=user.parent_name,
        parent_phone=user.parent_phone,
        service_permissions=permissions,
        subscription_plan=user.subscription_plan,
        subscription_status=user.subscription_status,
        subscription_expires_at=user.subscription_expires_at.isoformat()
        if user.subscription_expires_at
        else None,
    )
