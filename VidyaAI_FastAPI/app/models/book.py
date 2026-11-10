import enum
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Float, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BookStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"


class ChapterStatus(str, enum.Enum):
    PENDING = "pending"
    CLASSIFIED = "classified"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class LectureStatus(str, enum.Enum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class ScheduleStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    class_grade: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    file_type: Mapped[str] = mapped_column(String(20))
    program: Mapped[str] = mapped_column("track", String(20), default="school")
    exam_track: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[BookStatus] = mapped_column(
        SAEnum(BookStatus, values_callable=lambda x: [e.value for e in x], native_enum=False),
        default=BookStatus.UPLOADED,
    )
    processing_progress: Mapped[int] = mapped_column(Integer, default=0)
    processing_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_pdf_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_language: Mapped[str | None] = mapped_column(String(20), nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="books")
    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")
    pages = relationship("BookPage", back_populates="book", cascade="all, delete-orphan", order_by="BookPage.page_number")
    document_chunks = relationship("DocumentChunk", back_populates="book", cascade="all, delete-orphan")
    subject_agent = relationship("SubjectAgent", back_populates="book", cascade="all, delete-orphan", uselist=False)


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    chapter_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ChapterStatus] = mapped_column(
        SAEnum(ChapterStatus, values_callable=lambda x: [e.value for e in x], native_enum=False),
        default=ChapterStatus.PENDING,
    )
    pdf_start_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pdf_end_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_file_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_chapter_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="chapters")
    lecture_parts = relationship("LecturePart", back_populates="chapter", cascade="all, delete-orphan")
    chapter_pages = relationship("ChapterPage", back_populates="chapter", cascade="all, delete-orphan", order_by="ChapterPage.order_index")
    schedules = relationship("LectureSchedule", back_populates="chapter", cascade="all, delete-orphan")
    study_notes = relationship(
        "ChapterStudyNote",
        back_populates="chapter",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ChapterStudyNote(Base):
    """Complete curriculum study notes for the Notes section (not lecture-synced)."""

    __tablename__ = "chapter_study_notes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chapter_id: Mapped[int] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    board: Mapped[str] = mapped_column(String(40), default="CBSE")
    class_grade: Mapped[int] = mapped_column(Integer, default=0)
    subject: Mapped[str] = mapped_column(String(100), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(20), default="ready")
    content_json: Mapped[str] = mapped_column(Text, default="{}")
    topic_count: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chapter = relationship("Chapter", back_populates="study_notes")


class LecturePart(Base):
    __tablename__ = "lecture_parts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"))
    part_number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(255))
    script: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_minutes: Mapped[float] = mapped_column(Float, default=40.0)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[LectureStatus] = mapped_column(
        SAEnum(LectureStatus, values_callable=lambda x: [e.value for e in x], native_enum=False),
        default=LectureStatus.PENDING,
    )
    previous_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    lecture_persona: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chapter = relationship("Chapter", back_populates="lecture_parts")
    visual_frames = relationship(
        "LectureVisualFrame",
        back_populates="lecture_part",
        cascade="all, delete-orphan",
        order_by="LectureVisualFrame.frame_number",
    )


class LectureVisualFrame(Base):
    __tablename__ = "lecture_visual_frames"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lecture_part_id: Mapped[int] = mapped_column(ForeignKey("lecture_parts.id", ondelete="CASCADE"))
    frame_number: Mapped[int] = mapped_column(Integer)
    caption: Mapped[str] = mapped_column(String(500))
    segment_text: Mapped[str] = mapped_column(Text)
    image_path: Mapped[str] = mapped_column(String(500))
    start_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    book_page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_type: Mapped[str] = mapped_column(String(20), default="generated")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    lecture_part = relationship("LecturePart", back_populates="visual_frames")


class BookPage(Base):
    __tablename__ = "book_pages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id"))
    page_number: Mapped[int] = mapped_column(Integer)
    image_path: Mapped[str] = mapped_column(String(500))
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    book = relationship("Book", back_populates="pages")
    chapter_links = relationship("ChapterPage", back_populates="book_page", cascade="all, delete-orphan")


class ChapterPage(Base):
    __tablename__ = "chapter_pages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"))
    book_page_id: Mapped[int] = mapped_column(ForeignKey("book_pages.id"))
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    chapter = relationship("Chapter", back_populates="chapter_pages")
    book_page = relationship("BookPage", back_populates="chapter_links")


class LectureSchedule(Base):
    __tablename__ = "lecture_schedules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"))
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"))
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime)
    duration_minutes: Mapped[float] = mapped_column(Float, default=40.0)
    status: Mapped[ScheduleStatus] = mapped_column(
        SAEnum(ScheduleStatus, values_callable=lambda x: [e.value for e in x], native_enum=False),
        default=ScheduleStatus.SCHEDULED,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chapter = relationship("Chapter", back_populates="schedules")


class StudentProgress(Base):
    __tablename__ = "student_progress"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    lecture_part_id: Mapped[int] = mapped_column(ForeignKey("lecture_parts.id", ondelete="CASCADE"))
    completed: Mapped[bool] = mapped_column(default=False)
    last_position_seconds: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
