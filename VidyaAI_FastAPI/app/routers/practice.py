from datetime import datetime

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.practice import PracticePaper, PracticeTemplate
from app.models.user import User, UserRole
from app.schemas.practice import (
    PracticeFinishResponse,
    PracticeGenerateRequest,
    PracticePaperResponse,
    PracticeSubmitRequest,
    PracticeTemplateCreate,
    PracticeTemplateResponse,
    PracticeUploadQuestion,
    PracticeUploadSessionResponse,
)
from app.constants.programs import is_school_program, normalize_program
from app.services.practice_service import create_practice_paper_for_student, resolve_chapter_ids_for_term_exam, TERM_WRITTEN_BLUEPRINTS
from app.services.practice_evaluation_service import (
    _exam_payload,
    evaluate_answer_sheets,
    flatten_exam_questions,
    get_paper_by_upload_token,
    issue_upload_token,
    remaining_seconds,
    save_answer_images_by_question,
    upload_grace_deadline,
)
from app.utils.security import get_current_user, require_roles, get_tenant_scope, get_tenant_scope_optional
from app.utils.service_access import require_school_admin_with_services, require_student_service, user_has_service_permission

router = APIRouter(prefix="/api/practice", tags=["practice"])


def _effective_question_count(plan_type: str, question_count: int | None) -> int:
    if plan_type in TERM_WRITTEN_BLUEPRINTS:
        return 38
    return question_count or 12


def _parse_questions(raw: str) -> tuple[list[dict], dict | None]:
    try:
        parsed = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return [], None
    if isinstance(parsed, list):
        return parsed, None
    if isinstance(parsed, dict):
        return [], parsed
    return [], None


def _paper_response(paper: PracticePaper, upload_url: str | None = None) -> PracticePaperResponse:
    questions, exam = _parse_questions(paper.questions_json)
    evaluation = None
    if paper.evaluation_json:
        try:
            evaluation = json.loads(paper.evaluation_json)
        except json.JSONDecodeError:
            evaluation = None
    duration_minutes = None
    if exam and isinstance(exam.get("exam_meta"), dict):
        duration_minutes = exam["exam_meta"].get("duration_minutes")
    return PracticePaperResponse(
        id=paper.id,
        title=paper.title,
        subject=paper.subject,
        plan_type=paper.plan_type or "chapter",
        questions=questions,
        exam=exam,
        class_grade=paper.class_grade,
        total_marks=paper.total_marks,
        status=paper.status or "in_progress",
        score=paper.score,
        total_questions=paper.total_questions,
        submitted_at=paper.submitted_at,
        created_at=paper.created_at,
        started_at=getattr(paper, "started_at", None),
        ends_at=getattr(paper, "ends_at", None),
        remaining_seconds=remaining_seconds(paper),
        duration_minutes=duration_minutes,
        upload_url=upload_url,
        evaluation=evaluation,
    )


def _template_response(item: PracticeTemplate) -> PracticeTemplateResponse:
    chapter_ids = [int(x) for x in item.chapter_ids.split(",") if x.strip().isdigit()]
    return PracticeTemplateResponse(
        id=item.id,
        title=item.title,
        plan_type=item.plan_type,
        class_grade=item.class_grade,
        subject=item.subject,
        chapter_ids=chapter_ids,
        question_count=item.question_count,
        program=item.program,
        created_at=item.created_at,
    )


@router.get("/templates", response_model=list[PracticeTemplateResponse])
def list_templates(
    program: str | None = None,
    db: Session = Depends(get_db),
    scope: tuple[User, int | None] = Depends(get_tenant_scope_optional),
):
    user, school_id = scope
    q = db.query(PracticeTemplate)
    if user.role == UserRole.ADMIN:
        if school_id is None:
            return []
        if not user_has_service_permission(user, "practice", db):
            return []
        q = q.filter(PracticeTemplate.school_id == school_id)
        if program:
            q = q.filter(PracticeTemplate.program == normalize_program(program))
    elif user.role == UserRole.SUPER_ADMIN:
        if school_id is not None:
            q = q.filter(PracticeTemplate.school_id == school_id)
        if program:
            q = q.filter(PracticeTemplate.program == normalize_program(program))
    elif user.role == UserRole.STUDENT:
        if not user.school_id:
            return []
        if not user_has_service_permission(user, "practice", db):
            return []
        q = q.filter(PracticeTemplate.school_id == user.school_id)
        student_program = normalize_program(user.program)
        q = q.filter(PracticeTemplate.program == student_program)
        if is_school_program(user.program) and user.class_grade:
            q = q.filter(PracticeTemplate.class_grade == user.class_grade)
    else:
        return []

    items = q.order_by(PracticeTemplate.created_at.desc()).all()
    return [_template_response(item) for item in items]


@router.post("/templates", response_model=PracticeTemplateResponse)
def create_template(
    data: PracticeTemplateCreate,
    db: Session = Depends(get_db),
    scope: tuple[User, int] = Depends(get_tenant_scope),
):
    user, school_id = scope
    if not user_has_service_permission(user, "practice", db):
        raise HTTPException(status_code=403, detail="This feature is not included in your school's access role")

    template = PracticeTemplate(
        school_id=school_id,
        created_by_id=user.id,
        title=data.title,
        plan_type=data.plan_type,
        class_grade=data.class_grade,
        subject=data.subject,
        chapter_ids=",".join(str(i) for i in data.chapter_ids),
        question_count=data.question_count,
        program=normalize_program(data.program),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_response(template)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    scope: tuple[User, int | None] = Depends(get_tenant_scope_optional),
):
    user, school_id = scope
    template = db.query(PracticeTemplate).filter(PracticeTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if user.role == UserRole.ADMIN:
        if school_id != template.school_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not user_has_service_permission(user, "practice", db):
            raise HTTPException(status_code=403, detail="This feature is not included in your school's access role")
    elif user.role == UserRole.SUPER_ADMIN:
        pass
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(template)
    db.commit()
    return {"message": "Deleted", "template_id": template_id}


@router.post("/generate", response_model=PracticePaperResponse)
def generate_practice(
    data: PracticeGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("practice")),
):
    if data.template_id:
        template = db.query(PracticeTemplate).filter(PracticeTemplate.id == data.template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        plan_type = template.plan_type
        chapter_ids = [int(x) for x in template.chapter_ids.split(",") if x.strip().isdigit()]
        if plan_type in ("mid_term", "full_term") and user.school_id:
            chapter_ids = resolve_chapter_ids_for_term_exam(
                school_id=user.school_id,
                subject=template.subject,
                class_grade=template.class_grade,
                plan_type=plan_type,
                program=template.program,
            )
        if plan_type in ("mid_term", "full_term") and not chapter_ids:
            raise HTTPException(
                status_code=400,
                detail="No chapters found for this subject. Upload and process the textbook first.",
            )
        paper = create_practice_paper_for_student(
            student_id=user.id,
            subject=template.subject,
            class_grade=template.class_grade,
            plan_type=plan_type,
            chapter_ids=chapter_ids,
            question_count=template.question_count,
            title=template.title,
            template_id=template.id,
            program=template.program,
            school_id=user.school_id,
        )
    else:
        if not data.subject:
            raise HTTPException(status_code=400, detail="subject is required")
        class_grade = user.class_grade or 9
        plan_type = data.plan_type
        chapter_ids = data.chapter_ids
        if plan_type in ("mid_term", "full_term"):
            if not user.school_id:
                raise HTTPException(status_code=400, detail="School context required for term exams")
            chapter_ids = resolve_chapter_ids_for_term_exam(
                school_id=user.school_id,
                subject=data.subject,
                class_grade=class_grade,
                plan_type=plan_type,
                program=user.program or "school",
            )
            if not chapter_ids:
                raise HTTPException(
                    status_code=400,
                    detail="No chapters found for this subject. Upload and process the textbook first.",
                )
        elif plan_type == "mcq":
            if not chapter_ids and user.school_id:
                chapter_ids = resolve_chapter_ids_for_term_exam(
                    school_id=user.school_id,
                    subject=data.subject,
                    class_grade=class_grade,
                    plan_type="full_term",
                    program=user.program or "school",
                )
            if not chapter_ids:
                raise HTTPException(status_code=400, detail="No lessons found for this subject yet")
            title = f"{data.subject} Quick MCQ Quiz"
        elif plan_type == "chapter" and not chapter_ids:
            raise HTTPException(status_code=400, detail="Select at least one chapter")

        title = f"{data.subject} {plan_type.replace('_', ' ').title()}"
        if plan_type == "mid_term":
            title = f"{data.subject} Mid-Term (Half-Yearly) — 80 Marks"
        elif plan_type == "full_term":
            title = f"{data.subject} Full-Term (Annual) — 80 Marks"

        paper = create_practice_paper_for_student(
            student_id=user.id,
            subject=data.subject,
            class_grade=class_grade,
            plan_type=plan_type,
            chapter_ids=chapter_ids,
            question_count=_effective_question_count(plan_type, data.question_count),
            title=title,
            program=user.program or "school",
            school_id=user.school_id,
        )

    upload_url = f"/practice/upload/{paper.upload_token}" if paper.upload_token else None
    return _paper_response(paper, upload_url=upload_url)


@router.get("/papers/{paper_id}", response_model=PracticePaperResponse)
def get_paper(
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("practice")),
):
    paper = (
        db.query(PracticePaper)
        .filter(PracticePaper.id == paper_id, PracticePaper.student_id == user.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Practice paper not found")
    upload_url = f"/practice/upload/{paper.upload_token}" if paper.upload_token else None
    return _paper_response(paper, upload_url=upload_url)


@router.post("/papers/{paper_id}/finish", response_model=PracticeFinishResponse)
def finish_practice(
    paper_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("practice")),
):
    paper = (
        db.query(PracticePaper)
        .filter(PracticePaper.id == paper_id, PracticePaper.student_id == user.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Practice paper not found")
    if paper.status == "graded":
        raise HTTPException(status_code=400, detail="This paper is already graded")

    token, expires = issue_upload_token(paper)
    db.commit()
    db.refresh(paper)

    return PracticeFinishResponse(
        paper_id=paper.id,
        upload_token=token,
        upload_url=f"/practice/upload/{token}",
        expires_at=expires,
    )


@router.get("/upload/{token}", response_model=PracticeUploadSessionResponse)
def upload_session(token: str):
    paper = get_paper_by_upload_token(token)
    exam = _exam_payload(paper)
    questions = [
        PracticeUploadQuestion(
            number=q["number"],
            question=q["question"],
            marks=q["marks"],
            type=q.get("type"),
        )
        for q in flatten_exam_questions(paper)
    ]
    return PracticeUploadSessionResponse(
        paper_id=paper.id,
        title=paper.title,
        subject=paper.subject,
        status=paper.status or "awaiting_upload",
        exam_meta=exam.get("exam_meta", {}) if isinstance(exam, dict) else {},
        questions=questions,
        ends_at=getattr(paper, "ends_at", None),
        upload_grace_ends_at=upload_grace_deadline(paper),
    )


@router.post("/upload/{token}")
async def upload_answer_sheets(
    token: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Accept legacy flat `files` and/or per-question fields `q_<number>`."""
    form = await request.form()
    by_question: dict[str, list[tuple[str, bytes]]] = {}

    async def _read_upload(item: UploadFile, bucket: str) -> None:
        content = await item.read()
        if not content:
            return
        by_question.setdefault(bucket, []).append((item.filename or "sheet.jpg", content))

    for key, value in form.multi_items():
        if not hasattr(value, "read"):
            continue
        upload = value  # UploadFile-like
        key_l = str(key).strip().lower()
        if key_l in ("files", "file", "images", "sheets"):
            await _read_upload(upload, "_sheet")
        elif key_l.startswith("q_"):
            q_num = key_l[2:].strip()
            if q_num.isdigit():
                await _read_upload(upload, q_num)
        elif key_l.startswith("question_"):
            q_num = key_l[len("question_") :].strip()
            if q_num.isdigit():
                await _read_upload(upload, q_num)

    if not by_question:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one image (per question as q_<number> or as files)",
        )

    paper = save_answer_images_by_question(token, by_question)
    background_tasks.add_task(evaluate_answer_sheets, paper.id)

    paths = json.loads(paper.answer_sheet_paths or "[]")
    return {
        "message": "Answer sheets uploaded",
        "paper_id": paper.id,
        "page_count": len(paths) if isinstance(paths, list) else 0,
        "questions_with_images": sorted(
            k for k in json.loads(paper.answer_images_json or "{}") if k != "_sheet"
        ),
        "status": paper.status,
    }


@router.get("/upload/{token}/result")
def upload_result(token: str):
    paper = get_paper_by_upload_token(token)
    evaluation = None
    if paper.evaluation_json:
        try:
            evaluation = json.loads(paper.evaluation_json)
        except json.JSONDecodeError:
            evaluation = None
    max_marks = paper.total_marks or paper.total_questions or 0
    percent = round((paper.score or 0) / max_marks * 100) if max_marks else 0
    return {
        "paper_id": paper.id,
        "status": paper.status,
        "score": paper.score,
        "total": max_marks,
        "percent": percent,
        "evaluation": evaluation,
    }


@router.post("/papers/{paper_id}/submit")
def submit_practice(
    paper_id: int,
    data: PracticeSubmitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("practice")),
):
    paper = (
        db.query(PracticePaper)
        .filter(PracticePaper.id == paper_id, PracticePaper.student_id == user.id)
        .first()
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Practice paper not found")

    questions, exam = _parse_questions(paper.questions_json)
    if exam:
        raise HTTPException(
            status_code=400,
            detail="This is a written exam paper. Use Finish and upload your answer sheet instead.",
        )

    total = len(questions)
    if total == 0:
        raise HTTPException(status_code=400, detail="Paper has no questions")

    score = 0
    for index, question in enumerate(questions):
        given = data.answers.get(str(index), "")
        if given and given == question.get("answer"):
            score += 1

    paper.score = score
    paper.total_questions = total
    paper.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(paper)

    percent = round((score / total) * 100) if total else 0
    parent_notify = None
    try:
        from app.services.parent_report_service import notify_parents_practice_report

        parent_notify = notify_parents_practice_report(
            db,
            paper=paper,
            score=score,
            total=total,
            percent=float(percent),
            answers={str(k): str(v) for k, v in data.answers.items()},
        )
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "Failed to notify parent after practice submit paper_id=%s", paper.id
        )

    return {
        "paper_id": paper.id,
        "score": score,
        "total": total,
        "percent": percent,
        "plan_type": paper.plan_type,
        "parent_notify": {
            "sent": (parent_notify or {}).get("sent", 0),
            "phones": (parent_notify or {}).get("phones", []),
            "suggestions": (parent_notify or {}).get("suggestions", []),
            "error": (parent_notify or {}).get("error"),
        }
        if parent_notify
        else None,
    }


@router.get("/papers", response_model=list[PracticePaperResponse])
def list_papers(
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("practice")),
):
    papers = (
        db.query(PracticePaper)
        .filter(PracticePaper.student_id == user.id)
        .order_by(PracticePaper.created_at.desc())
        .limit(20)
        .all()
    )
    return [_paper_response(p) for p in papers]
