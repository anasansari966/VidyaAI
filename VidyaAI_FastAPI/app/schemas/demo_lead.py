from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class DemoLeadCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=8, max_length=30)
    organization: str = Field(min_length=2, max_length=255)
    role: str = Field(min_length=2, max_length=100)
    program: str = Field(min_length=2, max_length=50)
    student_count: str | None = Field(default=None, max_length=50)
    message: str | None = Field(default=None, max_length=2000)


class DemoLeadUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(new|contacted|qualified|closed)$")
    admin_notes: str | None = Field(default=None, max_length=2000)


class DemoLeadResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str
    organization: str
    role: str
    program: str
    student_count: str | None = None
    message: str | None = None
    status: str = "new"
    admin_notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
