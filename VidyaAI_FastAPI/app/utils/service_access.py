"""Resolve and enforce service permissions from access roles / school defaults."""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.constants.service_permissions import DEFAULT_FULL_PERMISSIONS, permissions_from_json
from app.database import get_db
from app.models.access_role import AccessRole
from app.models.school import School
from app.models.user import User, UserRole
from app.utils.security import get_current_user, require_roles


def _permissions_from_role(role: AccessRole | None) -> list[str]:
    if role is None:
        return list(DEFAULT_FULL_PERMISSIONS)
    return permissions_from_json(role.permissions_json)


def _load_access_role(db: Session, role_id: int | None) -> AccessRole | None:
    if role_id is None:
        return None
    return db.query(AccessRole).filter(AccessRole.id == role_id).first()


def resolve_service_permissions(user: User, db: Session | None = None) -> list[str]:
    if user.role == UserRole.SUPER_ADMIN:
        return list(DEFAULT_FULL_PERMISSIONS)

    if user.role == UserRole.STUDENT:
        from app.services.billing_service import permissions_for_user_plan

        plan_perms = permissions_for_user_plan(user)
        if plan_perms is not None:
            return plan_perms

        if user.access_role is not None:
            return _permissions_from_role(user.access_role)
        if user.access_role_id and db is not None:
            role = _load_access_role(db, user.access_role_id)
            if role:
                return _permissions_from_role(role)

    school = user.school
    if school is None and db is not None and user.school_id:
        school = (
            db.query(School)
            .options(joinedload(School.default_access_role))
            .filter(School.id == user.school_id)
            .first()
        )

    if school is not None:
        if school.default_access_role is not None:
            return _permissions_from_role(school.default_access_role)
        if school.default_access_role_id and db is not None:
            role = _load_access_role(db, school.default_access_role_id)
            if role:
                return _permissions_from_role(role)

    return list(DEFAULT_FULL_PERMISSIONS)


def user_has_service_permission(user: User, permission: str, db: Session) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return permission in resolve_service_permissions(user, db)


def require_school_admin_with_services(*service_permissions: str):
    def checker(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if user.role != UserRole.ADMIN or not user.school_id:
            raise HTTPException(status_code=403, detail="School admin required")
        if service_permissions:
            allowed = resolve_service_permissions(user, db)
            if not any(p in allowed for p in service_permissions):
                raise HTTPException(
                    status_code=403,
                    detail="This feature is not included in your school's access role",
                )
        return user

    return checker


def require_student_service(*service_permissions: str):
    def checker(
        user: User = Depends(require_roles(UserRole.STUDENT)),
        db: Session = Depends(get_db),
    ) -> User:
        from app.services.billing_service import individual_feature_access

        if not individual_feature_access(user, db):
            raise HTTPException(
                status_code=402,
                detail="Your individual plan is inactive. Please subscribe on the Pricing page.",
            )
        allowed = resolve_service_permissions(user, db)
        if not any(p in allowed for p in service_permissions):
            raise HTTPException(
                status_code=403,
                detail="This feature is not included in your access role",
            )
        return user

    return checker
