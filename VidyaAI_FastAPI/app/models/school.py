from datetime import datetime

from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    organization_type: Mapped[str] = mapped_column(String(100), default="school")
    default_access_role_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_roles.id"), nullable=True
    )
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled_class_grades_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_limits_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="school")
    books = relationship("Book", back_populates="school")
    default_access_role = relationship("AccessRole", foreign_keys=[default_access_role_id])
