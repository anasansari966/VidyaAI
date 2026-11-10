from datetime import date, datetime, time, timedelta

from pydantic import BaseModel, Field, field_validator

from app.models.book import ScheduleStatus


class ScheduleBulkCreate(BaseModel):
    class_grade: int = Field(ge=1, le=12)
    subject: str
    start_date: date
    weeks: int = Field(default=1, ge=1, le=52)
    days_of_week: list[int] = Field(min_length=1)
    start_time: str
    duration_minutes: float = Field(default=40.0, ge=5, le=180)

    @field_validator("days_of_week")
    @classmethod
    def validate_days(cls, value: list[int]) -> list[int]:
        cleaned = sorted(set(value))
        if any(day < 0 or day > 6 for day in cleaned):
            raise ValueError("days_of_week must be 0 (Mon) through 6 (Sun)")
        return cleaned

    @field_validator("start_time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        parts = value.strip().split(":")
        if len(parts) != 2:
            raise ValueError("start_time must be HH:MM")
        hour, minute = int(parts[0]), int(parts[1])
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError("Invalid start_time")
        return f"{hour:02d}:{minute:02d}"


class ScheduleCreate(BaseModel):
    chapter_id: int
    scheduled_at: datetime
    duration_minutes: float = Field(default=40.0, ge=5, le=180)


class ScheduleResponse(BaseModel):
    id: int
    chapter_id: int
    chapter_title: str
    chapter_number: int
    subject: str
    class_grade: int
    scheduled_at: datetime
    duration_minutes: float
    status: ScheduleStatus
    lecture_id: int | None = None
    has_recording: bool = False

    class Config:
        from_attributes = True


class ScheduleBulkResponse(BaseModel):
    message: str
    created: int
    schedules: list[ScheduleResponse]


class RecordingResponse(BaseModel):
    lecture_id: int
    title: str
    chapter_id: int
    chapter_title: str
    chapter_number: int
    subject: str
    class_grade: int
    duration_minutes: float
    audio_url: str | None
    completed_at: datetime | None = None
    last_position_seconds: int = 0


def parse_start_time(value: str) -> time:
    hour, minute = map(int, value.split(":"))
    return time(hour=hour, minute=minute)


def build_schedule_datetimes(
    *,
    start_date: date,
    weeks: int,
    days_of_week: list[int],
    start_time: str,
) -> list[datetime]:
    end_date = start_date + timedelta(weeks=weeks) - timedelta(days=1)
    clock = parse_start_time(start_time)
    results: list[datetime] = []
    current = start_date
    while current <= end_date:
        if current.weekday() in days_of_week:
            results.append(datetime.combine(current, clock))
        current += timedelta(days=1)
    return results
