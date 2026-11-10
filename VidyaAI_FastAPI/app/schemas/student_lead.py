from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class StudentLeadUpdate(BaseModel):
    status: str | None = Field(
        default=None,
        pattern="^(registered|verified|paid|contacted|closed)$",
    )
    admin_notes: str | None = Field(default=None, max_length=2000)


class StudentLeadResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str
    class_grade: int | None = None
    plan_id: str | None = None
    billing_cycle: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    school_name: str | None = None
    city: str | None = None
    board: str | None = None
    status: str = "registered"
    email_verified: bool = False
    user_id: int | None = None
    admin_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
