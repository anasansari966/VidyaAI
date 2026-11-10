"""Answer-sheet upload tokens and AI evaluation for written practice exams."""

from __future__ import annotations

import base64
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException

from app.config import settings
from app.database import SessionLocal
from app.models.practice import PracticePaper
from app.services.lecture_service import get_openai_client
from app.services.storage_service import read_bytes, write_bytes

logger = logging.getLogger(__name__)

TOKEN_TTL_HOURS = 24
UPLOAD_GRACE_MINUTES = 30
MAX_IMAGES_PER_QUESTION = 4
MAX_IMAGES_PER_PAPER = 40


def _exam_payload(paper: PracticePaper) -> dict[str, Any]:
    try:
        data = json.loads(paper.questions_json or "{}")
    except json.JSONDecodeError:
        return {"sections": [], "exam_meta": {}}
    if isinstance(data, list):
        return {
            "exam_meta": {"title": paper.title, "subject": paper.subject},
            "sections": [
                {
                    "id": "A",
                    "title": "Section A",
                    "questions": [
                        {
                            "number": i + 1,
                            "type": "mcq",
                            "question": q.get("question", ""),
                            "marks": 1,
                        }
                        for i, q in enumerate(data)
                    ],
                }
            ],
        }
    return data if isinstance(data, dict) else {"sections": [], "exam_meta": {}}


def flatten_exam_questions(paper: PracticePaper) -> list[dict[str, Any]]:
    exam = _exam_payload(paper)
    questions: list[dict[str, Any]] = []
    for section in exam.get("sections", []) or []:
        for q in section.get("questions", []) or []:
            try:
                number = int(q.get("number") or (len(questions) + 1))
            except (TypeError, ValueError):
                number = len(questions) + 1
            questions.append(
                {
                    "number": number,
                    "question": str(q.get("question") or "").strip(),
                    "marks": int(q.get("marks") or 1),
                    "type": q.get("type"),
                }
            )
    return questions


def remaining_seconds(paper: PracticePaper, *, now: datetime | None = None) -> int | None:
    if not paper.ends_at:
        return None
    now = now or datetime.utcnow()
    return max(0, int((paper.ends_at - now).total_seconds()))


def upload_grace_deadline(paper: PracticePaper) -> datetime | None:
    if not paper.ends_at:
        return paper.upload_token_expires
    return paper.ends_at + timedelta(minutes=UPLOAD_GRACE_MINUTES)


def issue_upload_token(paper: PracticePaper) -> tuple[str, datetime]:
    """Issue or reuse an upload token. Idempotent when already awaiting upload."""
    now = datetime.utcnow()
    if (
        paper.upload_token
        and paper.upload_token_expires
        and paper.upload_token_expires > now
        and paper.status in ("awaiting_upload", "evaluating", "in_progress")
    ):
        if paper.status == "in_progress":
            paper.status = "awaiting_upload"
        return paper.upload_token, paper.upload_token_expires

    token = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=TOKEN_TTL_HOURS)
    paper.upload_token = token
    paper.upload_token_expires = expires
    paper.status = "awaiting_upload"
    return token, expires


def get_paper_by_upload_token(token: str) -> PracticePaper:
    db = SessionLocal()
    try:
        paper = db.query(PracticePaper).filter(PracticePaper.upload_token == token).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Upload session not found")
        if paper.upload_token_expires and paper.upload_token_expires < datetime.utcnow():
            raise HTTPException(status_code=410, detail="Upload link has expired")
        grace = upload_grace_deadline(paper)
        if grace and datetime.utcnow() > grace and paper.status not in ("graded", "evaluating"):
            raise HTTPException(
                status_code=410,
                detail="Upload window has closed. Contact your teacher if you still need to submit.",
            )
        db.expunge(paper)
        return paper
    finally:
        db.close()


def _assert_upload_allowed(paper: PracticePaper) -> None:
    if paper.status == "graded":
        raise HTTPException(status_code=400, detail="This paper is already graded")
    if paper.upload_token_expires and paper.upload_token_expires < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Upload link has expired")
    grace = upload_grace_deadline(paper)
    if grace and datetime.utcnow() > grace:
        raise HTTPException(
            status_code=410,
            detail="Upload window has closed. Contact your teacher if you still need to submit.",
        )


def save_answer_sheet_images(token: str, files: list[tuple[str, bytes]]) -> PracticePaper:
    """Legacy whole-sheet upload (flat image list)."""
    by_question: dict[str, list[tuple[str, bytes]]] = {"_sheet": files}
    return save_answer_images_by_question(token, by_question)


def save_answer_images_by_question(
    token: str,
    by_question: dict[str, list[tuple[str, bytes]]],
) -> PracticePaper:
    """Store images keyed by question number (or `_sheet` for legacy pages)."""
    db = SessionLocal()
    try:
        paper = db.query(PracticePaper).filter(PracticePaper.upload_token == token).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Upload session not found")
        _assert_upload_allowed(paper)

        existing_map: dict[str, list[str]] = {}
        try:
            parsed = json.loads(paper.answer_images_json or "{}")
            if isinstance(parsed, dict):
                existing_map = {
                    str(k): list(v) if isinstance(v, list) else []
                    for k, v in parsed.items()
                }
        except json.JSONDecodeError:
            existing_map = {}

        existing_flat = json.loads(paper.answer_sheet_paths or "[]")
        if not isinstance(existing_flat, list):
            existing_flat = []

        total_existing = sum(len(v) for v in existing_map.values()) + len(existing_flat)
        new_count = sum(len(v) for v in by_question.values())
        if total_existing + new_count > MAX_IMAGES_PER_PAPER:
            raise HTTPException(
                status_code=400,
                detail=f"Too many images. Maximum {MAX_IMAGES_PER_PAPER} photos per paper.",
            )

        flat_paths: list[str] = list(existing_flat)

        for q_key, files in by_question.items():
            key = str(q_key).strip() or "_sheet"
            if key != "_sheet":
                current = existing_map.get(key, [])
                if len(current) + len(files) > MAX_IMAGES_PER_QUESTION:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Question {key}: maximum {MAX_IMAGES_PER_QUESTION} images",
                    )
            stored_for_q: list[str] = []
            for filename, content in files:
                if not content:
                    continue
                ext = "jpg"
                lower = filename.lower()
                if lower.endswith(".png"):
                    ext = "png"
                elif lower.endswith(".webp"):
                    ext = "webp"
                elif lower.endswith(".jpeg"):
                    ext = "jpg"
                path = (
                    f"uploads/practice/{paper.student_id}/{paper.id}/"
                    f"q{key}_{uuid.uuid4().hex}.{ext}"
                )
                stored = write_bytes(path, content, content_type=f"image/{ext}")
                stored_for_q.append(stored)
                flat_paths.append(stored)

            if key == "_sheet":
                # Legacy sheet pages stay only in flat list; also mirror under _sheet
                existing_map.setdefault("_sheet", [])
                existing_map["_sheet"].extend(stored_for_q)
            else:
                existing_map.setdefault(key, [])
                existing_map[key].extend(stored_for_q)

        paper.answer_images_json = json.dumps(existing_map, ensure_ascii=False)
        paper.answer_sheet_paths = json.dumps(flat_paths, ensure_ascii=False)
        paper.status = "evaluating"
        db.commit()
        db.refresh(paper)
        return paper
    finally:
        db.close()


def _image_part(path: str) -> dict[str, Any] | None:
    try:
        raw = read_bytes(path)
        b64 = base64.standard_b64encode(raw).decode("ascii")
        mime = "image/jpeg"
        lower = str(path).lower()
        if lower.endswith(".png"):
            mime = "image/png"
        elif lower.endswith(".webp"):
            mime = "image/webp"
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}"},
        }
    except Exception as exc:
        logger.warning("Could not read answer image %s: %s", path, exc)
        return None


def evaluate_answer_sheets(paper_id: int) -> dict[str, Any]:
    db = SessionLocal()
    try:
        paper = db.query(PracticePaper).filter(PracticePaper.id == paper_id).first()
        if not paper:
            raise HTTPException(status_code=404, detail="Practice paper not found")

        by_question: dict[str, list[str]] = {}
        try:
            parsed = json.loads(paper.answer_images_json or "{}")
            if isinstance(parsed, dict):
                by_question = {
                    str(k): [str(p) for p in v]
                    for k, v in parsed.items()
                    if isinstance(v, list)
                }
        except json.JSONDecodeError:
            by_question = {}

        flat_paths = json.loads(paper.answer_sheet_paths or "[]")
        if not isinstance(flat_paths, list):
            flat_paths = []

        if not by_question and not flat_paths:
            paper.status = "awaiting_upload"
            db.commit()
            raise HTTPException(status_code=400, detail="No answer sheets uploaded")

        questions = flatten_exam_questions(paper)
        exam = _exam_payload(paper)

        content_parts: list[dict[str, Any]] = []
        used_paths: set[str] = set()

        for q in questions:
            q_num = str(q["number"])
            paths = list(by_question.get(q_num) or [])
            if not paths and "_sheet" not in by_question:
                # No per-question photos — share remaining flat images once across all Qs
                paths = []
            label = (
                f"Question {q['number']} ({q['marks']} marks, type={q.get('type') or 'written'}):\n"
                f"{q['question']}\n"
                "Student answer images for THIS question follow (if any)."
            )
            content_parts.append({"type": "text", "text": label})
            for path in paths[:MAX_IMAGES_PER_QUESTION]:
                part = _image_part(path)
                if part:
                    content_parts.append(part)
                    used_paths.add(path)

        # Shared / legacy sheet images (not assigned to a question)
        leftover = [
            p
            for p in (by_question.get("_sheet") or flat_paths)
            if p not in used_paths
        ]
        if leftover:
            content_parts.append(
                {
                    "type": "text",
                    "text": (
                        "Additional answer-sheet page images (may cover multiple questions). "
                        "Use these for any question that has no dedicated photos."
                    ),
                }
            )
            for path in leftover[:12]:
                part = _image_part(path)
                if part:
                    content_parts.append(part)

        if len(content_parts) <= len(questions):
            raise HTTPException(status_code=400, detail="Could not read uploaded images")

        content_parts.insert(
            0,
            {
                "type": "text",
                "text": (
                    f"Subject: {paper.subject}\n"
                    f"Exam: {paper.title} ({paper.plan_type})\n"
                    f"Max marks: {paper.total_marks or 'unknown'}\n\n"
                    "Grade each question using the images bound to that question when available. "
                    "Allow partial marks. Be fair for handwriting. "
                    "Also give short study suggestions for weak areas."
                ),
            },
        )

        client = get_openai_client()
        response = client.chat.completions.create(
            model=settings.visual_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an Indian school examiner (CBSE/NCERT style). "
                        "Read handwritten answer images and grade against each question. "
                        "Return ONLY JSON: "
                        '{"total_marks_awarded":0,"max_marks":0,"percent":0,'
                        '"summary":"...","suggestions":["tip1","tip2"],'
                        '"questions":[{"number":1,"marks_awarded":0,'
                        '"max_marks":1,"feedback":"...","weak_topic":"..."}]}'
                    ),
                },
                {"role": "user", "content": content_parts},
            ],
            temperature=0.2,
            max_tokens=4096,
        )

        raw = (response.choices[0].message.content or "{}").strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        try:
            evaluation = json.loads(raw)
        except json.JSONDecodeError:
            evaluation = {
                "total_marks_awarded": 0,
                "max_marks": paper.total_marks or 0,
                "percent": 0,
                "summary": raw[:2000],
                "suggestions": [],
                "questions": [],
            }

        if not isinstance(evaluation.get("suggestions"), list):
            evaluation["suggestions"] = []
        evaluation["suggestions"] = [
            str(s).strip() for s in evaluation["suggestions"] if str(s).strip()
        ][:8]

        awarded = int(evaluation.get("total_marks_awarded") or 0)
        max_marks = int(evaluation.get("max_marks") or paper.total_marks or 0)
        if max_marks <= 0:
            max_marks = sum(int(q.get("marks") or 1) for q in questions)
        percent = round((awarded / max_marks) * 100) if max_marks else 0
        evaluation["percent"] = percent
        evaluation["max_marks"] = max_marks
        evaluation["total_marks_awarded"] = awarded

        paper.evaluation_json = json.dumps(evaluation, ensure_ascii=False)
        paper.score = awarded
        paper.total_questions = max_marks
        paper.total_marks = max_marks
        paper.status = "graded"
        paper.submitted_at = datetime.utcnow()
        db.commit()

        parent_notify = None
        try:
            from app.services.parent_report_service import notify_parents_practice_report

            parent_notify = notify_parents_practice_report(
                db,
                paper=paper,
                score=awarded,
                total=max_marks,
                percent=float(percent),
                evaluation=evaluation if isinstance(evaluation, dict) else None,
            )
        except Exception:
            logger.exception(
                "Failed to notify parent after grading paper_id=%s", paper.id
            )

        return {
            "paper_id": paper.id,
            "score": awarded,
            "total": max_marks,
            "percent": percent,
            "status": paper.status,
            "evaluation": evaluation,
            "parent_notify": {
                "sent": (parent_notify or {}).get("sent", 0),
                "phones": (parent_notify or {}).get("phones", []),
                "suggestions": (parent_notify or {}).get("suggestions", []),
                "error": (parent_notify or {}).get("error"),
            }
            if parent_notify
            else None,
        }
    finally:
        db.close()
