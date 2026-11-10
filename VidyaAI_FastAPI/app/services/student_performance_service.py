from datetime import datetime
import json

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.constants.programs import has_schedule
from app.models.book import Book, Chapter, LecturePart, StudentProgress, LectureStatus, LectureSchedule, ScheduleStatus
from app.models.practice import PracticePaper, PracticePlanType
from app.models.user import User
from app.utils.program_access import apply_student_book_scope, domain_subjects_for_student, lecture_progress_query

PLAN_TYPE_LABELS = {
    PracticePlanType.CHAPTER.value: "Chapter test",
    PracticePlanType.ASSESSMENT.value: "Assessment",
    PracticePlanType.HALF_TERM.value: "Half term",
    PracticePlanType.MID_TERM.value: "Half-year exam",
    PracticePlanType.FULL_TERM.value: "Full-year exam",
    PracticePlanType.MOCK_TEST.value: "Mock test",
    "mcq": "Quick quiz",
}


def _percent(score: int | None, total: int | None) -> float:
    if not score or not total or total <= 0:
        return 0.0
    return round((score / total) * 100, 1)


def build_student_performance(db: Session, user: User) -> dict:
    completed = lecture_progress_query(db, user, completed=True).count()
    in_progress = lecture_progress_query(db, user, completed=False).count()

    upcoming = 0
    if user.school_id and has_schedule(user.program):
        schedule_q = (
            db.query(LectureSchedule)
            .filter(
                LectureSchedule.school_id == user.school_id,
                LectureSchedule.status.in_([ScheduleStatus.SCHEDULED, ScheduleStatus.LIVE]),
                LectureSchedule.scheduled_at >= datetime.utcnow(),
            )
        )
        if user.class_grade:
            schedule_q = schedule_q.join(LectureSchedule.chapter).join(Chapter.book).filter(
                Book.program == "school",
                Book.class_grade == user.class_grade,
            )
        upcoming = schedule_q.count()

    subjects = domain_subjects_for_student(db, user)

    papers_q = db.query(PracticePaper).filter(
        PracticePaper.student_id == user.id,
        PracticePaper.submitted_at.isnot(None),
    )
    if subjects:
        papers_q = papers_q.filter(PracticePaper.subject.in_(subjects))
    papers = papers_q.order_by(PracticePaper.submitted_at.desc()).all()

    total_score = 0
    total_questions = 0
    mock_scores: list[float] = []
    exam_buckets: dict[str, dict] = {}

    for paper in papers:
        if not paper.total_questions or paper.total_questions <= 0:
            continue
        total_score += paper.score or 0
        total_questions += paper.total_questions
        plan_type = paper.plan_type or PracticePlanType.CHAPTER.value
        bucket = exam_buckets.setdefault(
            plan_type,
            {
                "plan_type": plan_type,
                "label": PLAN_TYPE_LABELS.get(plan_type, plan_type),
                "attempts": 0,
                "total_score": 0,
                "total_questions": 0,
            },
        )
        bucket["attempts"] += 1
        bucket["total_score"] += paper.score or 0
        bucket["total_questions"] += paper.total_questions
        if plan_type == PracticePlanType.MOCK_TEST.value:
            mock_scores.append(_percent(paper.score, paper.total_questions))

    scores_by_exam_type = []
    for plan_type in [
        PracticePlanType.MOCK_TEST.value,
        PracticePlanType.FULL_TERM.value,
        PracticePlanType.MID_TERM.value,
        PracticePlanType.HALF_TERM.value,
        PracticePlanType.ASSESSMENT.value,
        PracticePlanType.CHAPTER.value,
        "mcq",
    ]:
        bucket = exam_buckets.get(plan_type)
        if not bucket or bucket["attempts"] == 0:
            continue
        scores_by_exam_type.append(
            {
                "plan_type": plan_type,
                "label": bucket["label"],
                "attempts": bucket["attempts"],
                "avg_score": round((bucket["total_score"] / bucket["total_questions"]) * 100, 1),
            }
        )

    available_by_subject = {
        row[0]: row[1]
        for row in (
            apply_student_book_scope(
                db.query(Book.subject, func.count(LecturePart.id))
                .join(Chapter, Chapter.book_id == Book.id)
                .join(LecturePart, LecturePart.chapter_id == Chapter.id)
                .filter(LecturePart.status == LectureStatus.READY),
                user,
            )
            .group_by(Book.subject)
            .all()
        )
        if row[0]
    }

    completed_by_subject = {
        row[0]: row[1]
        for row in (
            lecture_progress_query(db, user, completed=True)
            .with_entities(Book.subject, func.count(StudentProgress.id))
            .group_by(Book.subject)
            .all()
        )
        if row[0]
    }

    progress_by_subject = []
    for subject in sorted(set(available_by_subject) | set(completed_by_subject)):
        available = available_by_subject.get(subject, 0)
        done = completed_by_subject.get(subject, 0)
        progress_by_subject.append(
            {
                "subject": subject,
                "completed": done,
                "available": available,
                "completion_rate": round((done / available) * 100, 1) if available else 0.0,
            }
        )

    recent_attempts = []
    weak_topics: dict[str, int] = {}
    suggestion_counts: dict[str, int] = {}
    latest_suggestions: list[str] = []

    for paper in papers[:8]:
        if not paper.total_questions or paper.total_questions <= 0:
            continue
        suggestions: list[str] = []
        if paper.evaluation_json:
            try:
                evaluation = json.loads(paper.evaluation_json)
                if isinstance(evaluation, dict):
                    raw_tips = evaluation.get("suggestions") or []
                    if isinstance(raw_tips, list):
                        suggestions = [str(t).strip() for t in raw_tips if str(t).strip()]
                        for tip in suggestions:
                            suggestion_counts[tip] = suggestion_counts.get(tip, 0) + 1
                        if not latest_suggestions and suggestions:
                            latest_suggestions = suggestions[:5]
                    for q in evaluation.get("questions") or []:
                        if not isinstance(q, dict):
                            continue
                        awarded = float(q.get("marks_awarded") or 0)
                        max_m = float(q.get("max_marks") or 1) or 1
                        topic = str(q.get("weak_topic") or "").strip()
                        if awarded / max_m < 0.6:
                            if not topic:
                                feedback = str(q.get("feedback") or "").strip()
                                topic = feedback[:80] if feedback else f"Question {q.get('number')}"
                            weak_topics[topic] = weak_topics.get(topic, 0) + 1
            except json.JSONDecodeError:
                evaluation = None

        recent_attempts.append(
            {
                "id": paper.id,
                "title": paper.title,
                "subject": paper.subject,
                "plan_type": paper.plan_type or PracticePlanType.CHAPTER.value,
                "label": PLAN_TYPE_LABELS.get(
                    paper.plan_type or PracticePlanType.CHAPTER.value, paper.plan_type
                ),
                "score": paper.score,
                "total_questions": paper.total_questions,
                "percent": _percent(paper.score, paper.total_questions),
                "submitted_at": paper.submitted_at.isoformat() if paper.submitted_at else None,
                "suggestions": suggestions,
            }
        )

    trend_percents = [a["percent"] for a in reversed(recent_attempts)]
    improvement_delta = None
    if len(trend_percents) >= 2:
        improvement_delta = round(trend_percents[-1] - trend_percents[0], 1)

    top_weak_areas = [
        {"topic": topic, "count": count}
        for topic, count in sorted(weak_topics.items(), key=lambda item: (-item[1], item[0]))[:5]
    ]
    recurring_suggestions = [
        {"suggestion": tip, "count": count}
        for tip, count in sorted(suggestion_counts.items(), key=lambda item: (-item[1], item[0]))[:5]
    ]

    return {
        "student_id": user.id,
        "full_name": user.full_name,
        "program": user.program or "school",
        "class_grade": user.class_grade,
        "lectures_completed": completed,
        "lectures_in_progress": in_progress,
        "upcoming_classes": upcoming,
        "subjects_available": len(subjects),
        "practice_papers": len([p for p in papers if p.total_questions and p.total_questions > 0]),
        "avg_score": round((total_score / total_questions) * 100, 1) if total_questions else 0.0,
        "attempts": len([p for p in papers if p.total_questions and p.total_questions > 0]),
        "best_mock_score": max(mock_scores) if mock_scores else None,
        "scores_by_exam_type": scores_by_exam_type,
        "progress_by_subject": progress_by_subject,
        "recent_attempts": recent_attempts,
        "improvement": {
            "score_delta": improvement_delta,
            "top_weak_areas": top_weak_areas,
            "latest_suggestions": latest_suggestions,
            "recurring_suggestions": recurring_suggestions,
        },
    }
