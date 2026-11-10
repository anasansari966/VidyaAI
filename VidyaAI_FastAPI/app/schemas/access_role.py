from pydantic import BaseModel, field_validator

from app.constants.service_permissions import ALL_SERVICE_PERMISSIONS, normalize_permissions


class AccessRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str]

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str]) -> list[str]:
        return normalize_permissions(value)


class AccessRoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return normalize_permissions(value)


class AccessRoleResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    permissions: list[str]
    is_system: bool = False

    class Config:
        from_attributes = True


class ServicePermissionInfo(BaseModel):
    key: str
    label: str


def list_permission_options() -> list[ServicePermissionInfo]:
    from app.constants.service_permissions import SERVICE_PERMISSION_LABELS

    return [
        ServicePermissionInfo(key=key, label=SERVICE_PERMISSION_LABELS[key])
        for key in ALL_SERVICE_PERMISSIONS
    ]
