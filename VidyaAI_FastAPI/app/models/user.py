import enum
from datetime import datetime

from sqlalchemy import Boolean, String, DateTime, ForeignKey, Enum as SAEnum, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    STUDENT = "student"
    PARENT = "parent"


class AccountStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    SERVICE_STOPPED = "service_stopped"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, values_callable=lambda x: [e.value for e in x], native_enum=False)
    )
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    class_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    program: Mapped[str] = mapped_column("track", String(20), default="school")
    exam_track: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    account_status: Mapped[str] = mapped_column(String(30), default=AccountStatus.ACTIVE.value)
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_role_id: Mapped[int | None] = mapped_column(ForeignKey("access_roles.id"), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    parent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    parent_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Individual billing (India Razorpay). School-managed students leave these null / school_managed.
    subscription_plan: Mapped[str | None] = mapped_column(String(40), nullable=True)
    subscription_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    subscription_cycle: Mapped[str | None] = mapped_column(String(20), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    board: Mapped[str | None] = mapped_column(String(40), nullable=True)
    enrolled_school_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="users")
    access_role = relationship("AccessRole", back_populates="users")
    parent_links = relationship(
        "ParentStudentLink",
        foreign_keys="ParentStudentLink.parent_id",
        back_populates="parent",
    )
    student_parent_links = relationship(
        "ParentStudentLink",
        foreign_keys="ParentStudentLink.student_id",
        back_populates="student",
    )
