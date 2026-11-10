from datetime import datetime

from pydantic import BaseModel

from app.models.book import BookStatus, ChapterStatus, LectureStatus


class BookUploadMeta(BaseModel):
    class_grade: int
    subject: str
    title: str


class ChapterCreate(BaseModel):
    chapter_number: int
    title: str
    content: str | None = None


class ManualChapterInput(BaseModel):
    chapter_number: int
    title: str
    content: str
    source_file_path: str | None = None
    source_file_type: str | None = None
    pdf_page_count: int | None = None


class ManualBookCreate(BaseModel):
    program: str = "school"
    exam_track: str = ""
    class_grade: int = 0
    subject: str
    title: str
    chapters: list[ManualChapterInput]
    school_id: int | None = None


class ChapterUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    chapter_number: int | None = None


class GenerateLecturesRequest(BaseModel):
    chapter_ids: list[int]
    lecture_language: str = "english"
    lecture_persona: str = "warm"


class LecturePartResponse(BaseModel):
    id: int
    part_number: int
    title: str
    duration_minutes: float
    word_count: int
    status: LectureStatus
    audio_url: str | None = None
    summary: str | None = None
    has_visuals: bool = False

    class Config:
        from_attributes = True


class VisualFrameResponse(BaseModel):
    id: int
    frame_number: int
    caption: str
    segment_text: str
    image_url: str
    start_seconds: float
    duration_seconds: float
    book_page_number: int | None = None
    source_type: str = "generated"
    page_summary: str | None = None


class LectureSegmentResponse(BaseModel):
    index: int
    text: str
    start_seconds: float
    duration_seconds: float


class LectureSessionResponse(BaseModel):
    lecture_id: int
    chapter_id: int
    title: str
    chapter_title: str
    subject: str
    class_grade: int
    audio_url: str | None
    duration_minutes: float
    script: str | None
    segments: list[LectureSegmentResponse]
    frames: list[VisualFrameResponse]
    visual_status: str = "ready"
    audio_status: str = "ready"
    audio_error: str | None = None
    audio_chunks_completed: int | None = None
    audio_chunks_total: int | None = None
    live_status: str = "none"
    scheduled_at: str | None = None
    live_position_seconds: float = 0
    is_live: bool = False
    auto_play: bool = False
    schedule_id: int | None = None


class ChapterResponse(BaseModel):
    id: int
    chapter_number: int
    source_chapter_number: int | None = None
    title: str
    display_label: str = ""
    content: str | None
    status: ChapterStatus
    lecture_parts: list[LecturePartResponse] = []

    class Config:
        from_attributes = True


class BookResponse(BaseModel):
    id: int
    class_grade: int
    subject: str
    title: str
    file_type: str
    status: BookStatus
    created_at: datetime
    program: str = "school"
    exam_track: str | None = None
    content_language: str | None = None
    chapters: list[ChapterResponse] = []
    processing_progress: int = 0
    processing_message: str | None = None

    class Config:
        from_attributes = True
