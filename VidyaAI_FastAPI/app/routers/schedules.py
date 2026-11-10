from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.constants.routes import api_path
from app.database import get_db
from app.models.book import Book, Chapter, LecturePart, LectureSchedule, LectureStatus, ScheduleStatus, StudentProgress
from app.models.user import User, UserRole
from app.schemas.schedule import (
    RecordingResponse,
    ScheduleBulkCreate,
    ScheduleBulkResponse,
    ScheduleCreate,
    ScheduleResponse,
    build_schedule_datetimes,
)
from app.constants.programs import is_school_program, normalize_program
from app.services.schedule_service import live_session_info, refresh_schedule_status
from app.utils.program_access import effective_exam_track
from app.utils.security import get_current_user, get_tenant_scope
from app.utils.service_access import (
    require_school_admin_with_services,
    require_student_service,
    user_has_service_permission,
)

require_schedule_admin = require_school_admin_with_services("schedule")

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _schedule_response(schedule: LectureSchedule, db: Session) -> ScheduleResponse:
    chapter = schedule.chapter
    book = chapter.book
    lecture = (
        db.query(LecturePart)
        .filter(LecturePart.chapter_id == chapter.id, LecturePart.status == LectureStatus.READY)
        .order_by(LecturePart.part_number)
        .first()
    )
    refresh_schedule_status(schedule)
    return ScheduleResponse(
        id=schedule.id,
        chapter_id=chapter.id,
        chapter_title=chapter.title,
        chapter_number=chapter.chapter_number,
        subject=book.subject,
        class_grade=book.class_grade,
        scheduled_at=schedule.scheduled_at,
        duration_minutes=schedule.duration_minutes,
        status=schedule.status,
        lecture_id=lecture.id if lecture else None,
        has_recording=bool(lecture and lecture.audio_path),
    )


def _chapters_for_class_subject(
    db: Session,
    *,
    school_id: int,
    class_grade: int,
    subject: str,
) -> list[Chapter]:
    return (
        db.query(Chapter)
        .join(Book)
        .filter(
            Book.school_id == school_id,
            Book.class_grade == class_grade,
            Book.subject == subject,
            Book.program == "school",
        )
        .order_by(Chapter.chapter_number)
        .all()
    )


@router.post("", response_model=ScheduleBulkResponse)
def create_schedules(
    data: ScheduleBulkCreate,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    user, resolved_school_id = scope
    if not user_has_service_permission(user, "schedule", db):
        raise HTTPException(status_code=403, detail="This feature is not included in your school's access role")

    chapters = _chapters_for_class_subject(
        db,
        school_id=resolved_school_id,
        class_grade=data.class_grade,
        subject=data.subject.strip(),
    )
    if not chapters:
        raise HTTPException(
            status_code=404,
            detail=f"No chapters found for Class {data.class_grade} {data.subject}",
        )

    slots = build_schedule_datetimes(
        start_date=data.start_date,
        weeks=data.weeks,
        days_of_week=data.days_of_week,
        start_time=data.start_time,
    )
    if not slots:
        raise HTTPException(status_code=400, detail="No sessions match the selected days and date range")

    created: list[LectureSchedule] = []
    for index, slot in enumerate(slots):
        chapter = chapters[index % len(chapters)]
        schedule = LectureSchedule(
            chapter_id=chapter.id,
            school_id=resolved_school_id,
            created_by_id=user.id,
            scheduled_at=slot,
            duration_minutes=data.duration_minutes,
            status=ScheduleStatus.SCHEDULED,
        )
        db.add(schedule)
        created.append(schedule)

    db.commit()

    responses: list[ScheduleResponse] = []
    for schedule in created:
        db.refresh(schedule)
        loaded = (
            db.query(LectureSchedule)
            .options(joinedload(LectureSchedule.chapter).joinedload(Chapter.book))
            .filter(LectureSchedule.id == schedule.id)
            .first()
        )
        if loaded:
            responses.append(_schedule_response(loaded, db))

    return ScheduleBulkResponse(
        message=(
            f"Scheduled {len(responses)} session(s) for Class {data.class_grade} {data.subject} "
            f"— chapters assigned automatically ({len(chapters)} in rotation)"
        ),
        created=len(responses),
        schedules=responses,
    )


@router.post("/single", response_model=ScheduleResponse)
def create_schedule_single(
    data: ScheduleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_schedule_admin),
):
    chapter = (
        db.query(Chapter)
        .options(joinedload(Chapter.book))
        .filter(Chapter.id == data.chapter_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    book = chapter.book
    if user.role == UserRole.ADMIN and book.school_id != user.school_id:
        raise HTTPException(status_code=403, detail="Access denied")

    schedule = LectureSchedule(
        chapter_id=chapter.id,
        school_id=book.school_id,
        created_by_id=user.id,
        scheduled_at=data.scheduled_at.replace(tzinfo=None) if data.scheduled_at.tzinfo else data.scheduled_at,
        duration_minutes=data.duration_minutes,
        status=ScheduleStatus.SCHEDULED,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    schedule = (
        db.query(LectureSchedule)
        .options(joinedload(LectureSchedule.chapter).joinedload(Chapter.book))
        .filter(LectureSchedule.id == schedule.id)
        .first()
    )
    return _schedule_response(schedule, db)


@router.get("", response_model=list[ScheduleResponse])
def list_schedules(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(LectureSchedule).options(
        joinedload(LectureSchedule.chapter).joinedload(Chapter.book)
    )

    if user.role == UserRole.ADMIN:
        if not user.school_id:
            return []
        if not user_has_service_permission(user, "schedule", db):
            return []
        q = q.filter(LectureSchedule.school_id == user.school_id)
    elif user.role == UserRole.STUDENT:
        if not user.school_id:
            return []
        if not user_has_service_permission(user, "schedule", db):
            return []
        q = q.filter(LectureSchedule.school_id == user.school_id)
        q = q.join(LectureSchedule.chapter).join(Chapter.book)
        if is_school_program(user.program) and user.class_grade:
            q = q.filter(Book.program == "school", Book.class_grade == user.class_grade)
        elif is_school_program(user.program):
            q = q.filter(Book.program == "school")
        else:
            track = effective_exam_track(user.program, user.exam_track)
            q = q.filter(
                Book.program == normalize_program(user.program),
                Book.exam_track == track,
            )
    elif user.role != UserRole.SUPER_ADMIN:
        return []

    schedules = q.order_by(LectureSchedule.scheduled_at.desc()).all()
    for schedule in schedules:
        refresh_schedule_status(schedule)
    db.commit()
    return [_schedule_response(item, db) for item in schedules]


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_schedule_admin),
):
    schedule = (
        db.query(LectureSchedule)
        .options(joinedload(LectureSchedule.chapter).joinedload(Chapter.book))
        .filter(LectureSchedule.id == schedule_id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if user.role == UserRole.ADMIN and schedule.school_id != user.school_id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(schedule)
    db.commit()
    return {"message": "Schedule deleted", "schedule_id": schedule_id}


@router.get("/recordings", response_model=list[RecordingResponse])
def list_recordings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role not in (UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return []

    q = (
        db.query(LecturePart)
        .join(Chapter, LecturePart.chapter_id == Chapter.id)
        .join(Book, Chapter.book_id == Book.id)
        .options(joinedload(LecturePart.chapter).joinedload(Chapter.book))
        .filter(LecturePart.status == LectureStatus.READY, LecturePart.audio_path.isnot(None))
    )

    if user.role in (UserRole.STUDENT, UserRole.ADMIN):
        if not user.school_id:
            return []
        if user.role == UserRole.STUDENT and not user_has_service_permission(user, "recordings", db):
            return []
        if user.role == UserRole.ADMIN and not user_has_service_permission(user, "recordings", db):
            return []
        q = q.filter(Book.school_id == user.school_id)
        if user.role == UserRole.STUDENT:
            if is_school_program(user.program) and user.class_grade:
                q = q.filter(Book.program == "school", Book.class_grade == user.class_grade)
            elif is_school_program(user.program):
                q = q.filter(Book.program == "school")
            else:
                track = effective_exam_track(user.program, user.exam_track)
                q = q.filter(
                    Book.program == normalize_program(user.program),
                    Book.exam_track == track,
                )

    lectures = q.order_by(LecturePart.created_at.desc()).all()
    progress_by_lecture: dict[int, StudentProgress] = {}
    if user.role == UserRole.STUDENT:
        progress_rows = (
            db.query(StudentProgress)
            .filter(StudentProgress.student_id == user.id)
            .all()
        )
        progress_by_lecture = {row.lecture_part_id: row for row in progress_rows}

    recordings: list[RecordingResponse] = []
    for lecture in lectures:
        chapter = lecture.chapter
        book = chapter.book
        completed_schedule = (
            db.query(LectureSchedule)
            .filter(
                LectureSchedule.chapter_id == chapter.id,
                LectureSchedule.status == ScheduleStatus.COMPLETED,
            )
            .order_by(LectureSchedule.scheduled_at.desc())
            .first()
        )
        progress = progress_by_lecture.get(lecture.id)
        recordings.append(
            RecordingResponse(
                lecture_id=lecture.id,
                title=lecture.title,
                chapter_id=chapter.id,
                chapter_title=chapter.title,
                chapter_number=chapter.chapter_number,
                subject=book.subject,
                class_grade=book.class_grade,
                duration_minutes=lecture.duration_minutes,
                audio_url=api_path(f"/api/books/lectures/{lecture.id}/audio"),
                completed_at=completed_schedule.scheduled_at if completed_schedule else lecture.created_at,
                last_position_seconds=progress.last_position_seconds if progress else 0,
            )
        )

    return recordings
