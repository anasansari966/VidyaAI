from datetime import datetime

from pydantic import BaseModel, field_validator

from app.constants.programs import normalize_program


class SchoolCreate(BaseModel):
    name: str
    organization_type: str = "school"
    default_access_role_id: int
    address: str | None = None
    enabled_class_grades: list[int] = list(range(1, 13))
    student_limits: dict[int, int] = {}

    @field_validator("organization_type")
    @classmethod
    def validate_organization_type(cls, value: str) -> str:
        return normalize_program(value)

    @field_validator("enabled_class_grades")
    @classmethod
    def validate_classes(cls, value: list[int]) -> list[int]:
        cleaned = sorted({int(c) for c in value if 1 <= int(c) <= 12})
        if not cleaned:
            raise ValueError("Select at least one class (1–12)")
        return cleaned


class SchoolUpdate(BaseModel):
    name: str | None = None
    organization_type: str | None = None
    default_access_role_id: int | None = None
    address: str | None = None
    enabled_class_grades: list[int] | None = None
    student_limits: dict[int, int] | None = None

    @field_validator("organization_type")
    @classmethod
    def validate_organization_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_program(value)


class SchoolResponse(BaseModel):
    id: int
    name: str
    organization_type: str
    default_access_role_id: int | None = None
    address: str | None
    enabled_class_grades: list[int] = list(range(1, 13))
    student_limits: dict[int, int] = {}
    created_at: datetime
    admin_count: int = 0
    student_count: int = 0

    class Config:
        from_attributes = True
