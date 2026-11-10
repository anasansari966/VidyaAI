from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.book import Book
from app.models.school import School
from app.models.user import User, UserRole
from app.utils.slugify import slugify


@dataclass(frozen=True)
class StorageScope:
    tenant_name: str
    admin_name: str

    def key(self, *parts: str) -> str:
        tenant = slugify(self.tenant_name)
        admin = slugify(self.admin_name)
        return "/".join(["uploads", tenant, admin, *parts])


def scope_for_admin(user: User, school: School | None) -> StorageScope:
    tenant = school.name if school else f"school-{user.school_id or 'unknown'}"
    admin = user.full_name or user.email or "admin"
    return StorageScope(tenant_name=tenant, admin_name=admin)


def scope_for_book(book: Book, db: Session) -> StorageScope:
    school = db.query(School).filter(School.id == book.school_id).first()
    admin = (
        db.query(User).filter(User.id == book.uploaded_by_id).first()
        if book.uploaded_by_id
        else None
    )
    if admin is None and school is not None:
        admin = (
            db.query(User)
            .filter(User.school_id == book.school_id, User.role == UserRole.ADMIN)
            .order_by(User.id)
            .first()
        )
    tenant = school.name if school else f"school-{book.school_id}"
    admin_name = (admin.full_name or admin.email) if admin else "unknown-admin"
    return StorageScope(tenant_name=tenant, admin_name=admin_name)


def scope_for_user(user: User, db: Session) -> StorageScope:
    school = db.query(School).filter(School.id == user.school_id).first() if user.school_id else None
    tenant = school.name if school else f"school-{user.school_id or 'unknown'}"
    name = user.full_name or user.email or f"user-{user.id}"
    return StorageScope(tenant_name=tenant, admin_name=name)
