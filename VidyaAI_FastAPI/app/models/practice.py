import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PracticePlanType(str, enum.Enum):
    CHAPTER = "chapter"
    ASSESSMENT = "assessment"
    HALF_TERM = "half_term"
    MID_TERM = "mid_term"
    FULL_TERM = "full_term"
    MOCK_TEST = "mock_test"


class PracticeTemplate(Base):
    __tablename__ = "practice_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    plan_type: Mapped[str] = mapped_column(String(30), default=PracticePlanType.CHAPTER.value)
    class_grade: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(100))
    chapter_ids: Mapped[str] = mapped_column(Text, default="")
    question_count: Mapped[int] = mapped_column(Integer, default=10)
    program: Mapped[str] = mapped_column("track", String(20), default="school")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PracticePaper(Base):
    __tablename__ = "practice_papers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    template_id: Mapped[int | None] = mapped_column(ForeignKey("practice_templates.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(100))
    plan_type: Mapped[str] = mapped_column(String(30), default=PracticePlanType.CHAPTER.value)
    questions_json: Mapped[str] = mapped_column(Text)
    chapter_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    class_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_marks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="in_progress")
    upload_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    upload_token_expires: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    answer_sheet_paths: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_images_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_questions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
