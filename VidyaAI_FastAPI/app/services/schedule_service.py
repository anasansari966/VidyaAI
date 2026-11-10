from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.book import LectureSchedule, ScheduleStatus


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def schedule_window(schedule: LectureSchedule) -> tuple[datetime, datetime]:
    start = schedule.scheduled_at
    end = start + timedelta(minutes=schedule.duration_minutes)
    return start, end


def refresh_schedule_status(schedule: LectureSchedule) -> ScheduleStatus:
    if schedule.status == ScheduleStatus.CANCELLED:
        return schedule.status

    now = _utc_now()
    start, end = schedule_window(schedule)

    if now < start:
        schedule.status = ScheduleStatus.SCHEDULED
    elif start <= now < end:
        schedule.status = ScheduleStatus.LIVE
    else:
        schedule.status = ScheduleStatus.COMPLETED

    return schedule.status


def find_schedule_for_session(
    db: Session,
    *,
    chapter_id: int,
    school_id: int | None,
) -> LectureSchedule | None:
    """Prefer the schedule that is live right now, then the next upcoming one."""
    query = db.query(LectureSchedule).filter(LectureSchedule.chapter_id == chapter_id)
    if school_id:
        query = query.filter(LectureSchedule.school_id == school_id)

    schedules = query.all()
    if not schedules:
        return None

    live_schedule: LectureSchedule | None = None
    upcoming_schedule: LectureSchedule | None = None
    now = _utc_now()

    for schedule in schedules:
        if refresh_schedule_status(schedule) == ScheduleStatus.LIVE:
            live_schedule = schedule
            break

    if live_schedule:
        return live_schedule

    for schedule in schedules:
        if refresh_schedule_status(schedule) != ScheduleStatus.SCHEDULED:
            continue
        if schedule.scheduled_at < now:
            continue
        if upcoming_schedule is None or schedule.scheduled_at < upcoming_schedule.scheduled_at:
            upcoming_schedule = schedule

    if upcoming_schedule:
        return upcoming_schedule

    return max(schedules, key=lambda item: item.scheduled_at)


def live_session_info(
    schedule: LectureSchedule | None,
    *,
    max_position_seconds: float | None = None,
) -> dict:
    if not schedule:
        return {
            "live_status": "none",
            "scheduled_at": None,
            "live_position_seconds": 0,
            "is_live": False,
            "auto_play": False,
        }

    status = refresh_schedule_status(schedule)
    start, end = schedule_window(schedule)
    now = _utc_now()

    if status == ScheduleStatus.SCHEDULED:
        return {
            "live_status": "upcoming",
            "scheduled_at": start.isoformat(),
            "live_position_seconds": 0,
            "is_live": False,
            "auto_play": False,
        }

    if status == ScheduleStatus.LIVE:
        elapsed = max(0, (now - start).total_seconds())
        if max_position_seconds is not None:
            elapsed = min(elapsed, max_position_seconds)
        return {
            "live_status": "live",
            "scheduled_at": start.isoformat(),
            "live_position_seconds": round(elapsed, 1),
            "is_live": True,
            "auto_play": True,
        }

    return {
        "live_status": "ended",
        "scheduled_at": start.isoformat(),
        "live_position_seconds": 0,
        "is_live": False,
        "auto_play": False,
    }
