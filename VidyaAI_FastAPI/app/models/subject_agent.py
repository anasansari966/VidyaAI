from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubjectAgent(Base):
    """Dynamic subject-expert persona created after each book upload."""

    __tablename__ = "subject_agents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id"), unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(100))
    content_language: Mapped[str] = mapped_column(String(20), default="en-IN")
    teaching_style: Mapped[str] = mapped_column(String(100), default="classroom")
    system_prompt: Mapped[str] = mapped_column(Text)
    tts_voice_id: Mapped[str] = mapped_column(String(50), default="Kajal")
    expertise_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="subject_agent")
