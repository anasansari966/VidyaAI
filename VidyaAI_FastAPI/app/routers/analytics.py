from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User, UserRole
from app.models.school import School
from app.models.book import Book, Chapter, LecturePart, LectureStatus, LectureSchedule, ScheduleStatus
from app.models.practice import PracticePaper, PracticePlanType
from app.constants.programs import is_school_program, normalize_program, PROGRAM_LABELS, has_schedule
from app.utils.program_access import apply_admin_student_scope, apply_book_program_filters, domain_subjects_for_student, lecture_progress_query
from app.utils.security import require_roles, get_current_user, get_tenant_scope
from app.services.student_performance_service import build_student_performance

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

PLAN_TYPE_LABELS = {
    PracticePlanType.CHAPTER.value: "Chapter test",
    PracticePlanType.ASSESSMENT.value: "Assessment",
    PracticePlanType.HALF_TERM.value: "Half term",
    PracticePlanType.MID_TERM.value: "Mid term",
    PracticePlanType.MOCK_TEST.value: "Mock test",
}


def _percent(score: int | None, total: int | None) -> float:
    if not score or not total or total <= 0:
        return 0.0
    return round((score / total) * 100, 1)


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role == UserRole.SUPER_ADMIN:
        return {
            "role": "super_admin",
            "schools": db.query(School).count(),
            "admins": db.query(User).filter(User.role == UserRole.ADMIN).count(),
            "students": db.query(User).filter(User.role == UserRole.STUDENT).count(),
            "books": db.query(Book).count(),
            "chapters": db.query(Chapter).count(),
            "lectures": db.query(LecturePart).filter(LecturePart.status == LectureStatus.READY).count(),
        }

    if user.role == UserRole.ADMIN and user.school_id:
        student_q = db.query(User).filter(
            User.school_id == user.school_id, User.role == UserRole.STUDENT
        )
        student_q = apply_admin_student_scope(student_q, user)
        students = student_q.count()

        book_q = db.query(Book).filter(Book.school_id == user.school_id)
        book_q = apply_book_program_filters(
            book_q,
            program=user.program,
            class_grade=None if is_school_program(user.program) else None,
            exam_track=user.exam_track,
        )
        books = book_q.count()

        chapter_q = (
            db.query(Chapter)
            .join(Book)
            .filter(Book.school_id == user.school_id)
        )
        chapter_q = apply_book_program_filters(
            chapter_q,
            program=user.program,
            exam_track=user.exam_track,
        )
        chapters = chapter_q.count()

        lecture_q = (
            db.query(LecturePart)
            .join(Chapter)
            .join(Book)
            .filter(Book.school_id == user.school_id)
        )
        lecture_q = apply_book_program_filters(
            lecture_q,
            program=user.program,
            exam_track=user.exam_track,
        )
        lectures = lecture_q.count()

        by_grade = (
            book_q.with_entities(Book.class_grade, func.count(Book.id))
            .group_by(Book.class_grade)
            .all()
        )
        return {
            "role": "admin",
            "students": students,
            "books": books,
            "chapters": chapters,
            "lectures": lectures,
            "books_by_grade": {str(g): c for g, c in by_grade},
        }

    if user.role == UserRole.STUDENT:
        completed = lecture_progress_query(db, user, completed=True).count()
        in_progress = lecture_progress_query(db, user, completed=False).count()
        upcoming = 0
        if user.school_id and has_schedule(user.program):
            q = (
                db.query(LectureSchedule)
                .filter(
                    LectureSchedule.school_id == user.school_id,
                    LectureSchedule.status.in_([ScheduleStatus.SCHEDULED, ScheduleStatus.LIVE]),
                    LectureSchedule.scheduled_at >= datetime.utcnow(),
                )
            )
            if user.class_grade:
                q = q.join(LectureSchedule.chapter).join(Chapter.book).filter(
                    Book.program == "school",
                    Book.class_grade == user.class_grade,
                )
            upcoming = q.count()

        subjects = len(domain_subjects_for_student(db, user))

        domain_subjects = domain_subjects_for_student(db, user)
        practice_q = db.query(PracticePaper).filter(
            PracticePaper.student_id == user.id,
            PracticePaper.submitted_at.isnot(None),
        )
        if domain_subjects:
            practice_q = practice_q.filter(PracticePaper.subject.in_(domain_subjects))
        practice_count = practice_q.count()

        return {
            "role": "student",
            "program": user.program or "school",
            "class_grade": user.class_grade,
            "lectures_completed": completed,
            "lectures_in_progress": in_progress,
            "upcoming_classes": upcoming,
            "subjects_available": subjects,
            "practice_papers": practice_count,
        }

    return {"role": user.role}


@router.get("/my-performance")
def my_performance(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.STUDENT)),
):
    """Personal analytics for the logged-in student."""
    return build_student_performance(db, user)


@router.get("/student-performance")
def student_performance(
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    actor, school_id = scope

    q = db.query(User).filter(User.school_id == school_id, User.role == UserRole.STUDENT)
    q = apply_admin_student_scope(q, actor)
    students = q.all()
    student_ids = [s.id for s in students]

    papers = []
    if student_ids:
        papers = (
            db.query(PracticePaper)
            .filter(
                PracticePaper.student_id.in_(student_ids),
                PracticePaper.submitted_at.isnot(None),
                PracticePaper.total_questions.isnot(None),
                PracticePaper.total_questions > 0,
            )
            .all()
        )

    by_program: dict[str, int] = {}
    for student in students:
        program = normalize_program(student.program)
        by_program[program] = by_program.get(program, 0) + 1

    students_by_domain = [
        {
            "program": program,
            "label": PROGRAM_LABELS.get(program, program),
            "count": count,
        }
        for program, count in sorted(by_program.items(), key=lambda item: item[1], reverse=True)
    ]

    student_map = {s.id: s for s in students}
    aggregates: dict[int, dict] = {}
    for paper in papers:
        student = student_map.get(paper.student_id)
        if not student:
            continue
        bucket = aggregates.setdefault(
            paper.student_id,
            {
                "student_id": paper.student_id,
                "full_name": student.full_name,
                "program": normalize_program(student.program),
                "exam_track": student.exam_track,
                "class_grade": student.class_grade,
                "attempts": 0,
                "total_score": 0.0,
                "total_questions": 0,
                "mock_scores": [],
            },
        )
        bucket["attempts"] += 1
        bucket["total_score"] += paper.score or 0
        bucket["total_questions"] += paper.total_questions or 0
        if paper.plan_type == PracticePlanType.MOCK_TEST.value:
            bucket["mock_scores"].append(_percent(paper.score, paper.total_questions))

    top_students = []
    for item in aggregates.values():
        avg_score = (
            round((item["total_score"] / item["total_questions"]) * 100, 1)
            if item["total_questions"]
            else 0.0
        )
        best_mock = max(item["mock_scores"]) if item["mock_scores"] else None
        top_students.append(
            {
                "student_id": item["student_id"],
                "full_name": item["full_name"],
                "program": item["program"],
                "exam_track": item["exam_track"],
                "class_grade": item["class_grade"],
                "avg_score": avg_score,
                "attempts": item["attempts"],
                "best_mock_score": best_mock,
            }
        )
    top_students.sort(key=lambda row: (row["avg_score"], row["attempts"]), reverse=True)
    top_students = top_students[:10]

    exam_buckets: dict[str, dict] = {}
    for paper in papers:
        plan_type = paper.plan_type or PracticePlanType.CHAPTER.value
        bucket = exam_buckets.setdefault(
            plan_type,
            {"plan_type": plan_type, "label": PLAN_TYPE_LABELS.get(plan_type, plan_type), "attempts": 0, "total_score": 0, "total_questions": 0},
        )
        bucket["attempts"] += 1
        bucket["total_score"] += paper.score or 0
        bucket["total_questions"] += paper.total_questions or 0

    scores_by_exam_type = []
    for plan_type in [
        PracticePlanType.MOCK_TEST.value,
        PracticePlanType.MID_TERM.value,
        PracticePlanType.HALF_TERM.value,
        PracticePlanType.ASSESSMENT.value,
        PracticePlanType.CHAPTER.value,
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

    domain_leaderboards: dict[str, list] = {}
    for program in by_program:
        leaders = [row for row in top_students if row["program"] == program][:5]
        domain_leaderboards[program] = leaders

    return {
        "students_by_domain": students_by_domain,
        "top_students": top_students,
        "scores_by_exam_type": scores_by_exam_type,
        "domain_leaderboards": domain_leaderboards,
    }
