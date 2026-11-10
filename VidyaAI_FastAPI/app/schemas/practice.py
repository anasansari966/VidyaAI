from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.constants.programs import normalize_program


class PracticeTemplateCreate(BaseModel):
    title: str
    plan_type: str = "chapter"
    class_grade: int = Field(ge=0, le=12)
    subject: str
    chapter_ids: list[int] = []
    question_count: int = Field(default=10, ge=5, le=50)
    program: str = "school"

    @field_validator("program")
    @classmethod
    def validate_program(cls, value: str) -> str:
        return normalize_program(value)


class PracticeTemplateResponse(BaseModel):
    id: int
    title: str
    plan_type: str
    class_grade: int
    subject: str
    chapter_ids: list[int]
    question_count: int
    program: str
    created_at: datetime

    class Config:
        from_attributes = True


class PracticeGenerateRequest(BaseModel):
    template_id: int | None = None
    subject: str | None = None
    plan_type: str = "chapter"
    chapter_ids: list[int] = []
    question_count: int | None = Field(default=None, ge=5, le=50)


class PracticePaperResponse(BaseModel):
    id: int
    title: str
    subject: str
    plan_type: str = "chapter"
    questions: list[dict] = Field(default_factory=list)
    exam: dict | None = None
    class_grade: int | None = None
    total_marks: int | None = None
    status: str = "in_progress"
    score: int | None = None
    total_questions: int | None = None
    submitted_at: datetime | None = None
    created_at: datetime
    started_at: datetime | None = None
    ends_at: datetime | None = None
    remaining_seconds: int | None = None
    duration_minutes: int | None = None
    upload_url: str | None = None
    evaluation: dict | None = None


class PracticeFinishResponse(BaseModel):
    paper_id: int
    upload_token: str
    upload_url: str
    expires_at: datetime


class PracticeUploadQuestion(BaseModel):
    number: int
    question: str
    marks: int = 1
    type: str | None = None


class PracticeUploadSessionResponse(BaseModel):
    paper_id: int
    title: str
    subject: str
    status: str
    exam_meta: dict = Field(default_factory=dict)
    questions: list[PracticeUploadQuestion] = Field(default_factory=list)
    ends_at: datetime | None = None
    upload_grace_ends_at: datetime | None = None


class PracticeSubmitRequest(BaseModel):
    answers: dict[str, str] = Field(default_factory=dict)
