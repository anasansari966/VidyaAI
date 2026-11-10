"""Build practice/mock report cards and notify parents on WhatsApp."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.book import Chapter
from app.models.parent_student_link import ParentStudentLink
from app.models.practice import PracticePaper, PracticePlanType
from app.models.user import User, UserRole
from app.services.whatsapp_service import send_whatsapp_text
from app.utils.parent_accounts import normalize_phone

logger = logging.getLogger(__name__)

PLAN_TYPE_LABELS = {
    PracticePlanType.CHAPTER.value: "Chapter practice test",
    PracticePlanType.ASSESSMENT.value: "Assessment",
    PracticePlanType.HALF_TERM.value: "Half-term test",
    PracticePlanType.MID_TERM.value: "Mid-term exam",
    PracticePlanType.FULL_TERM.value: "Full-term exam",
    PracticePlanType.MOCK_TEST.value: "Mock test",
}


def _chapter_titles(db: Session, paper: PracticePaper) -> list[str]:
    raw = paper.chapter_ids_json or "[]"
    try:
        ids = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        ids = []
    if not isinstance(ids, list) or not ids:
        # Fall back to exam meta chapters embedded in questions_json
        try:
            payload = json.loads(paper.questions_json or "{}")
            if isinstance(payload, dict):
                meta = payload.get("exam_meta") or {}
                chapters = meta.get("chapters") or []
                if isinstance(chapters, list):
                    return [str(c) for c in chapters if c]
        except json.JSONDecodeError:
            pass
        return []

    chapters = (
        db.query(Chapter)
        .filter(Chapter.id.in_([int(i) for i in ids if str(i).isdigit() or isinstance(i, int)]))
        .order_by(Chapter.chapter_number.asc())
        .all()
    )
    return [f"Ch.{c.chapter_number}: {c.title}" for c in chapters]


def _resolve_parent_phones(db: Session, student: User) -> list[str]:
    phones: list[str] = []
    seen: set[str] = set()

    def add(phone: str | None) -> None:
        digits = normalize_phone(phone)
        if digits and digits not in seen:
            seen.add(digits)
            phones.append(digits)

    add(student.parent_phone)

    linked = (
        db.query(User)
        .join(ParentStudentLink, ParentStudentLink.parent_id == User.id)
        .filter(
            ParentStudentLink.student_id == student.id,
            User.role == UserRole.PARENT,
            User.is_active.is_(True),
        )
        .all()
    )
    for parent in linked:
        add(parent.phone)

    return phones


def _mcq_wrong_count(paper: PracticePaper, answers: dict[str, str] | None) -> tuple[int, int]:
    if not answers:
        return 0, 0
    try:
        questions = json.loads(paper.questions_json or "[]")
    except json.JSONDecodeError:
        return 0, 0
    if not isinstance(questions, list):
        return 0, 0
    wrong = 0
    for index, question in enumerate(questions):
        given = (answers.get(str(index)) or "").strip().lower()[:1]
        expected = str(question.get("answer") or "").strip().lower()[:1]
        if given and expected and given != expected:
            wrong += 1
    return wrong, len(questions)


def build_chapter_suggestions(
    *,
    db: Session,
    paper: PracticePaper,
    percent: float,
    evaluation: dict[str, Any] | None = None,
    answers: dict[str, str] | None = None,
) -> list[str]:
    chapters = _chapter_titles(db, paper)
    suggestions: list[str] = []

    if evaluation and isinstance(evaluation.get("questions"), list):
        weak = []
        for item in evaluation["questions"]:
            try:
                awarded = float(item.get("marks_awarded") or 0)
                max_marks = float(item.get("max_marks") or 0)
            except (TypeError, ValueError):
                continue
            if max_marks <= 0:
                continue
            ratio = awarded / max_marks
            if ratio < 0.6:
                feedback = str(item.get("feedback") or "").strip()
                number = item.get("number")
                label = f"Q{number}" if number is not None else "A question"
                if feedback:
                    weak.append(f"{label}: revise — {feedback[:120]}")
                else:
                    weak.append(f"{label}: scored {int(awarded)}/{int(max_marks)} — revise this topic")
        suggestions.extend(weak[:4])

    wrong, total = _mcq_wrong_count(paper, answers)
    if total and wrong:
        if chapters:
            suggestions.append(
                f"Focus revision on: {', '.join(chapters[:3])}"
                + ("…" if len(chapters) > 3 else "")
                + f" ({wrong}/{total} quiz answers incorrect)."
            )
        else:
            suggestions.append(
                f"Revisit {paper.subject} concepts covered in this paper "
                f"({wrong}/{total} quiz answers incorrect)."
            )

    if not suggestions and chapters:
        if percent >= 80:
            suggestions.append(
                f"Strong result. Keep consolidating: {', '.join(chapters[:3])}."
            )
        elif percent >= 50:
            suggestions.append(
                f"Revise these chapters again this week: {', '.join(chapters[:4])}."
            )
        else:
            suggestions.append(
                f"Priority revision chapters: {', '.join(chapters[:4])}. "
                "Short daily practice will help raise the score."
            )
    elif not suggestions:
        if percent >= 80:
            suggestions.append(f"Great work in {paper.subject}. Maintain weekly practice.")
        elif percent >= 50:
            suggestions.append(
                f"Review class notes for {paper.subject} and retry a short practice set."
            )
        else:
            suggestions.append(
                f"Schedule teacher support for {paper.subject} and revise recent lessons first."
            )

    # Deduplicate while preserving order
    unique: list[str] = []
    seen: set[str] = set()
    for item in suggestions:
        key = item.strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(key)
    return unique[:5]


def build_report_card_message(
    *,
    student: User,
    paper: PracticePaper,
    score: int,
    total: int,
    percent: float,
    suggestions: list[str],
    evaluation: dict[str, Any] | None = None,
) -> str:
    plan_label = PLAN_TYPE_LABELS.get(paper.plan_type or "", paper.plan_type or "Practice")
    class_bit = f"Class {student.class_grade}" if student.class_grade else "Student"
    summary = ""
    if evaluation and evaluation.get("summary"):
        summary = str(evaluation["summary"]).strip()
        if len(summary) > 280:
            summary = summary[:277] + "..."

    lines = [
        "📘 *VidyaAI Report Card*",
        "",
        f"Student: *{student.full_name}* ({class_bit})",
        f"Test: {paper.title}",
        f"Type: {plan_label}",
        f"Subject: {paper.subject}",
        f"Score: *{score}/{total}* ({percent}%)",
    ]
    if summary:
        lines.extend(["", f"Teacher summary: {summary}"])

    lines.extend(["", "*Chapter suggestions for improvement:*"])
    if suggestions:
        for index, tip in enumerate(suggestions, start=1):
            lines.append(f"{index}. {tip}")
    else:
        lines.append("1. Continue regular practice and revise recent chapters.")

    lines.extend(
        [
            "",
            "This is an automated update from your school via VidyaAI.",
            "Open the Parent portal anytime to track full progress.",
        ]
    )
    return "\n".join(lines)


def list_student_report_cards(db: Session, student: User) -> list[dict[str, Any]]:
    papers = (
        db.query(PracticePaper)
        .filter(
            PracticePaper.student_id == student.id,
            PracticePaper.submitted_at.isnot(None),
            PracticePaper.score.isnot(None),
        )
        .order_by(PracticePaper.submitted_at.desc())
        .all()
    )
    rows: list[dict[str, Any]] = []
    for paper in papers:
        total = int(paper.total_questions or paper.total_marks or 0)
        score = int(paper.score or 0)
        percent = round((score / total) * 100, 1) if total else 0.0
        plan_label = PLAN_TYPE_LABELS.get(paper.plan_type or "", paper.plan_type or "Practice")
        rows.append(
            {
                "paper_id": paper.id,
                "title": paper.title,
                "subject": paper.subject,
                "plan_type": paper.plan_type,
                "plan_label": plan_label,
                "score": score,
                "total": total,
                "percent": percent,
                "status": paper.status,
                "submitted_at": paper.submitted_at.isoformat() if paper.submitted_at else None,
                "has_pdf": True,
            }
        )
    return rows


def _student_visualization_data(db: Session, student: User, current_paper_id: int) -> tuple[list[dict], list[dict]]:
    papers = (
        db.query(PracticePaper)
        .filter(
            PracticePaper.student_id == student.id,
            PracticePaper.submitted_at.isnot(None),
            PracticePaper.score.isnot(None),
        )
        .order_by(PracticePaper.submitted_at.asc())
        .all()
    )
    history: list[dict[str, Any]] = []
    subject_totals: dict[str, list[float]] = {}
    for paper in papers:
        total = int(paper.total_questions or paper.total_marks or 0)
        score = int(paper.score or 0)
        if total <= 0:
            continue
        percent = round((score / total) * 100, 1)
        label = (paper.subject or "Test")[:10]
        if paper.submitted_at:
            label = paper.submitted_at.strftime("%d %b")
        history.append(
            {
                "paper_id": paper.id,
                "label": label,
                "percent": percent,
                "is_current": paper.id == current_paper_id,
            }
        )
        subject = (paper.subject or "General").strip() or "General"
        subject_totals.setdefault(subject, []).append(percent)

    subject_averages = [
        {
            "subject": subject,
            "avg_percent": round(sum(values) / len(values), 1),
            "attempts": len(values),
        }
        for subject, values in subject_totals.items()
        if values
    ]
    subject_averages.sort(key=lambda row: row["avg_percent"])
    return history, subject_averages


def build_student_report_pdf(db: Session, student: User, paper_id: int) -> tuple[bytes, str]:
    paper = (
        db.query(PracticePaper)
        .filter(
            PracticePaper.id == paper_id,
            PracticePaper.student_id == student.id,
            PracticePaper.submitted_at.isnot(None),
            PracticePaper.score.isnot(None),
        )
        .first()
    )
    if not paper:
        raise ValueError("Report not found")

    total = int(paper.total_questions or paper.total_marks or 0)
    score = int(paper.score or 0)
    percent = round((score / total) * 100, 1) if total else 0.0
    plan_label = PLAN_TYPE_LABELS.get(paper.plan_type or "", paper.plan_type or "Practice")

    evaluation = None
    if paper.evaluation_json:
        try:
            evaluation = json.loads(paper.evaluation_json)
        except json.JSONDecodeError:
            evaluation = None

    suggestions = build_chapter_suggestions(
        db=db,
        paper=paper,
        percent=percent,
        evaluation=evaluation if isinstance(evaluation, dict) else None,
    )
    chapters = _chapter_titles(db, paper)
    summary = None
    question_feedback = None
    if isinstance(evaluation, dict):
        summary = str(evaluation.get("summary") or "").strip() or None
        if isinstance(evaluation.get("questions"), list):
            question_feedback = evaluation["questions"]

    history, subject_averages = _student_visualization_data(db, student, paper.id)

    from app.services.report_pdf_service import build_report_card_pdf

    pdf_bytes = build_report_card_pdf(
        student_name=student.full_name,
        class_grade=student.class_grade,
        paper_title=paper.title,
        subject=paper.subject,
        plan_label=plan_label,
        score=score,
        total=total,
        percent=percent,
        submitted_at=paper.submitted_at,
        chapters=chapters,
        suggestions=suggestions,
        evaluation_summary=summary,
        question_feedback=question_feedback,
        history=history,
        subject_averages=subject_averages,
    )
    safe_name = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in paper.title)[:40]
    filename = f"report_{student.id}_{paper.id}_{safe_name or 'card'}.pdf"
    return pdf_bytes, filename


def build_overall_student_report_pdf(db: Session, student: User) -> tuple[bytes, str]:
    from app.services.report_pdf_service import build_overall_student_pdf
    from app.services.student_performance_service import build_student_performance

    performance = build_student_performance(db, student)
    history, subject_averages = _student_visualization_data(db, student, current_paper_id=-1)
    avg = float(performance.get("avg_score") or 0)
    weak_subjects = sorted(subject_averages, key=lambda row: row["avg_percent"])[:3]
    suggestions = [
        f"Focus on {row['subject']} (avg {row['avg_percent']}%)."
        for row in weak_subjects
        if row["avg_percent"] < 75
    ]
    if not suggestions:
        suggestions = ["Maintain current practice rhythm across subjects."]

    pdf_bytes = build_overall_student_pdf(
        student_name=student.full_name,
        class_grade=student.class_grade,
        program=student.program,
        avg_score=avg,
        attempts=int(performance.get("attempts") or 0),
        best_mock_score=performance.get("best_mock_score"),
        lectures_completed=int(performance.get("lectures_completed") or 0),
        lectures_in_progress=int(performance.get("lectures_in_progress") or 0),
        history=history,
        subject_averages=subject_averages,
        exam_type_scores=performance.get("scores_by_exam_type") or [],
        recent_attempts=performance.get("recent_attempts") or [],
        suggestions=suggestions,
    )
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in student.full_name)[:40]
    filename = f"overall_{student.id}_{safe or 'student'}.pdf"
    return pdf_bytes, filename


def list_admin_student_records(db: Session, students: list[User]) -> list[dict[str, Any]]:
    """Bulk performance rows for school admin."""
    if not students:
        return []

    student_map = {s.id: s for s in students}
    papers = (
        db.query(PracticePaper)
        .filter(
            PracticePaper.student_id.in_(list(student_map.keys())),
            PracticePaper.submitted_at.isnot(None),
            PracticePaper.score.isnot(None),
        )
        .all()
    )

    aggregates: dict[int, dict[str, Any]] = {
        sid: {
            "student_id": sid,
            "full_name": student.full_name,
            "email": student.email,
            "program": student.program or "school",
            "exam_track": student.exam_track,
            "class_grade": student.class_grade,
            "attempts": 0,
            "total_score": 0.0,
            "total_questions": 0,
            "mock_scores": [],
            "last_submitted_at": None,
        }
        for sid, student in student_map.items()
    }

    for paper in papers:
        bucket = aggregates.get(paper.student_id)
        if not bucket:
            continue
        total = int(paper.total_questions or paper.total_marks or 0)
        score = int(paper.score or 0)
        if total <= 0:
            continue
        bucket["attempts"] += 1
        bucket["total_score"] += score
        bucket["total_questions"] += total
        if paper.plan_type == PracticePlanType.MOCK_TEST.value:
            bucket["mock_scores"].append(round((score / total) * 100, 1))
        if paper.submitted_at and (
            bucket["last_submitted_at"] is None or paper.submitted_at > bucket["last_submitted_at"]
        ):
            bucket["last_submitted_at"] = paper.submitted_at

    rows: list[dict[str, Any]] = []
    for item in aggregates.values():
        avg_score = (
            round((item["total_score"] / item["total_questions"]) * 100, 1)
            if item["total_questions"]
            else 0.0
        )
        last_at = item["last_submitted_at"]
        rows.append(
            {
                "student_id": item["student_id"],
                "full_name": item["full_name"],
                "email": item["email"],
                "program": item["program"],
                "exam_track": item["exam_track"],
                "class_grade": item["class_grade"],
                "avg_score": avg_score,
                "attempts": item["attempts"],
                "best_mock_score": max(item["mock_scores"]) if item["mock_scores"] else None,
                "last_submitted_at": last_at.isoformat() if last_at else None,
            }
        )

    rows.sort(key=lambda row: (row["avg_score"], row["attempts"]), reverse=True)
    return rows


def build_class_performance_report_pdf(
    db: Session,
    *,
    students: list[User],
    class_grade: int | None,
    school_name: str | None = None,
) -> tuple[bytes, str]:
    from app.services.report_pdf_service import build_class_bulk_report_pdf

    if class_grade is None:
        scoped = [s for s in students if s.class_grade is None]
        class_label = "Unassigned"
        file_key = "unassigned"
    else:
        scoped = [s for s in students if s.class_grade == class_grade]
        class_label = f"Class {class_grade}"
        file_key = f"class_{class_grade}"

    rows = list_admin_student_records(db, scoped)
    # Keep name order for "all students", but top performers by score
    by_name = sorted(rows, key=lambda row: str(row.get("full_name") or "").lower())
    top = [row for row in rows if int(row.get("attempts") or 0) > 0][:10]

    pdf_bytes = build_class_bulk_report_pdf(
        class_label=class_label,
        school_name=school_name,
        students=by_name,
        top_performers=top,
    )
    filename = f"class_records_{file_key}.pdf"
    return pdf_bytes, filename


def notify_parents_practice_report(
    db: Session,
    *,
    paper: PracticePaper,
    score: int,
    total: int,
    percent: float,
    evaluation: dict[str, Any] | None = None,
    answers: dict[str, str] | None = None,
) -> dict[str, Any]:
    student = db.query(User).filter(User.id == paper.student_id).first()
    if not student:
        return {"sent": 0, "phones": [], "results": [], "message": None, "error": "student_not_found"}

    suggestions = build_chapter_suggestions(
        db=db,
        paper=paper,
        percent=percent,
        evaluation=evaluation,
        answers=answers,
    )
    message = build_report_card_message(
        student=student,
        paper=paper,
        score=score,
        total=total,
        percent=percent,
        suggestions=suggestions,
        evaluation=evaluation,
    )
    phones = _resolve_parent_phones(db, student)
    if not phones:
        logger.info(
            "No parent phone for student_id=%s paper_id=%s; report not sent",
            student.id,
            paper.id,
        )
        return {
            "sent": 0,
            "phones": [],
            "results": [],
            "message": message,
            "suggestions": suggestions,
            "error": "no_parent_phone",
        }

    results = []
    sent = 0
    for phone in phones:
        result = send_whatsapp_text(to_phone=phone, body=message)
        results.append(result)
        if result.get("ok"):
            sent += 1

    return {
        "sent": sent,
        "phones": phones,
        "results": results,
        "message": message,
        "suggestions": suggestions,
        "error": None if sent else (results[0].get("status") if results else "send_failed"),
    }
