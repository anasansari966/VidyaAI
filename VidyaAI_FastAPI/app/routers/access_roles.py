from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.constants.service_permissions import permissions_from_json, permissions_to_json
from app.database import get_db
from app.models.access_role import AccessRole
from app.models.user import User
from app.schemas.access_role import (
    AccessRoleCreate,
    AccessRoleResponse,
    AccessRoleUpdate,
    ServicePermissionInfo,
    list_permission_options,
)
from app.utils.security import require_roles, require_super_admin
from app.models.user import UserRole

router = APIRouter(prefix="/api/access-roles", tags=["access-roles"])


def _role_response(role: AccessRole) -> AccessRoleResponse:
    return AccessRoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=permissions_from_json(role.permissions_json),
        is_system=role.is_system,
    )


@router.get("/options", response_model=list[ServicePermissionInfo])
def permission_options(
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    return list_permission_options()


@router.get("", response_model=list[AccessRoleResponse])
def list_access_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
):
    roles = db.query(AccessRole).order_by(AccessRole.is_system.desc(), AccessRole.name).all()
    return [_role_response(role) for role in roles]


@router.post("", response_model=AccessRoleResponse)
def create_access_role(
    data: AccessRoleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if db.query(AccessRole).filter(AccessRole.name == name).first():
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = AccessRole(
        name=name,
        description=data.description,
        permissions_json=permissions_to_json(data.permissions),
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _role_response(role)


@router.patch("/{role_id}", response_model=AccessRoleResponse)
def update_access_role(
    role_id: int,
    data: AccessRoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = db.query(AccessRole).filter(AccessRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Role name is required")
        existing = db.query(AccessRole).filter(AccessRole.name == name, AccessRole.id != role_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Role name already exists")
        role.name = name

    if data.description is not None:
        role.description = data.description or None

    if data.permissions is not None:
        role.permissions_json = permissions_to_json(data.permissions)

    db.commit()
    db.refresh(role)
    return _role_response(role)


@router.delete("/{role_id}")
def delete_access_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = db.query(AccessRole).filter(AccessRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")

    in_use = db.query(User).filter(User.access_role_id == role_id).count()
    if in_use:
        raise HTTPException(status_code=400, detail=f"Role is assigned to {in_use} user(s)")

    db.delete(role)
    db.commit()
    return {"message": "Role deleted", "role_id": role_id}
