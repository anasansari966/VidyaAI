import json
import logging
import secrets
from datetime import datetime, timedelta

from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.book import Book, Chapter
from app.models.practice import PracticePaper, PracticeTemplate
from app.constants.programs import normalize_program, practice_exam_hint
from app.services.lecture_service import get_openai_client

logger = logging.getLogger(__name__)

# Fixed CBSE written-paper sections (internal assessment excluded).
TERM_WRITTEN_BLUEPRINTS: dict[str, dict] = {
    "mid_term": {
        "duration": 180,
        "exam_label": "Mid-Term (Half-Yearly) Examination",
        "written_marks": 80,
        "sections": [
            {"id": "A", "title": "Section A — MCQ / Objective Type", "type": "mcq", "count": 20, "marks": 1},
            {"id": "B", "title": "Section B — Very Short Answer Questions", "type": "very_short", "count": 6, "marks": 2},
            {"id": "C", "title": "Section C — Short Answer Questions", "type": "short", "count": 6, "marks": 3},
            {"id": "D", "title": "Section D — Long Answer Questions", "type": "long", "count": 4, "marks": 5},
            {"id": "E", "title": "Section E — Case Study / Source-Based Questions", "type": "case_study", "count": 2, "marks": 3},
            {"id": "F", "title": "Section F — Map / Diagram (if applicable)", "type": "map_diagram", "count": 1, "marks": 4},
        ],
    },
    "full_term": {
        "duration": 180,
        "exam_label": "Full-Term (Annual) Examination",
        "written_marks": 80,
        "sections": [
            {"id": "A", "title": "Section A — MCQ / Objective Type", "type": "mcq", "count": 20, "marks": 1},
            {"id": "B", "title": "Section B — Very Short Answer Questions", "type": "very_short", "count": 5, "marks": 2},
            {"id": "C", "title": "Section C — Short Answer Questions", "type": "short", "count": 6, "marks": 3},
            {"id": "D", "title": "Section D — Long Answer Questions", "type": "long", "count": 4, "marks": 5},
            {"id": "E", "title": "Section E — Case Study / Source-Based Questions", "type": "case_study", "count": 2, "marks": 4},
            {"id": "F", "title": "Section F — Map / Diagram / Practical-Based", "type": "map_diagram", "count": 1, "marks": 4},
        ],
    },
}

EXAM_BLUEPRINTS: dict[str, dict] = {
    "chapter": {
        "duration": 45,
        "sections": [
            ("A", "Objective Type (MCQs)", "mcq", 0.65, 1),
            ("B", "Short Answer Questions", "short", 0.35, 2),
        ],
    },
    "assessment": {
        "duration": 60,
        "sections": [
            ("A", "Objective Type (MCQs)", "mcq", 0.55, 1),
            ("B", "Short Answer Questions", "short", 0.45, 3),
        ],
    },
    "half_term": {
        "duration": 90,
        "sections": [
            ("A", "Objective Type (MCQs)", "mcq", 0.35, 1),
            ("B", "Short Answer Questions", "short", 0.4, 2),
            ("C", "Long Answer Questions", "long", 0.25, 5),
        ],
    },
    "mock_test": {
        "duration": 180,
        "sections": [
            ("A", "Objective Type (MCQs)", "mcq", 0.4, 1),
            ("B", "Numerical / Short Answer", "short", 0.35, 3),
            ("C", "Long Answer Questions", "long", 0.25, 5),
        ],
    },
}

INDIAN_INSTRUCTIONS = [
    "Read all questions carefully before answering.",
    "Write answers in the space provided on your answer sheet.",
    "For MCQs, write the correct option letter (a/b/c/d) in your answer sheet.",
    "All questions are compulsory unless stated otherwise.",
    "Marks are indicated against each question.",
    "This is the written examination paper only (80 marks). Internal assessment is separate.",
]


def resolve_chapter_ids_for_term_exam(
    *,
    school_id: int,
    subject: str,
    class_grade: int,
    plan_type: str,
    program: str = "school",
) -> list[int]:
    """Mid-term uses first half of book chapters; full-term uses the entire book."""
    if plan_type not in ("mid_term", "full_term"):
        return []

    db = SessionLocal()
    try:
        books = (
            db.query(Book)
            .filter(
                Book.school_id == school_id,
                Book.subject == subject,
                Book.class_grade == class_grade,
                Book.program == normalize_program(program),
            )
            .order_by(Book.id.asc())
            .all()
        )
        if not books:
            return []

        chapter_ids: list[int] = []
        for book in books:
            chapters = (
                db.query(Chapter)
                .filter(Chapter.book_id == book.id)
                .order_by(Chapter.chapter_number.asc())
                .all()
            )
            chapter_ids.extend(c.id for c in chapters)

        if not chapter_ids:
            return []

        if plan_type == "full_term":
            return chapter_ids

        half = (len(chapter_ids) + 1) // 2
        return chapter_ids[:half]
    finally:
        db.close()


def _chapter_titles(chapter_ids: list[int]) -> list[str]:
    if not chapter_ids:
        return []
    db = SessionLocal()
    try:
        chapters = db.query(Chapter).filter(Chapter.id.in_(chapter_ids)).order_by(Chapter.chapter_number).all()
        return [f"Chapter {c.chapter_number}: {c.title}" for c in chapters]
    finally:
        db.close()


def _split_counts(total: int, weights: list[float]) -> list[int]:
    if total <= 0:
        return [0] * len(weights)
    raw = [max(1, round(total * w)) for w in weights]
    while sum(raw) > total:
        idx = raw.index(max(raw))
        if raw[idx] > 1:
            raw[idx] -= 1
        else:
            break
    while sum(raw) < total:
        raw[0] += 1
    return raw


def _fixed_section_specs(plan_type: str) -> list[dict]:
    blueprint = TERM_WRITTEN_BLUEPRINTS[plan_type]
    return [
        {
            "id": section["id"],
            "title": section["title"],
            "type": section["type"],
            "count": section["count"],
            "marks_per_question": section["marks"],
        }
        for section in blueprint["sections"]
    ]


def generate_indian_exam_paper(
    *,
    subject: str,
    class_grade: int,
    plan_type: str,
    chapter_titles: list[str],
    question_count: int,
    program: str = "school",
) -> dict:
    plan_type = plan_type or "chapter"
    program = normalize_program(program)
    exam_hint = practice_exam_hint(program)
    is_term_exam = plan_type in TERM_WRITTEN_BLUEPRINTS

    if is_term_exam:
        term_blueprint = TERM_WRITTEN_BLUEPRINTS[plan_type]
        section_specs = _fixed_section_specs(plan_type)
        duration = term_blueprint["duration"]
        written_marks = term_blueprint["written_marks"]
        plan_label = term_blueprint["exam_label"]
    else:
        blueprint = EXAM_BLUEPRINTS.get(plan_type, EXAM_BLUEPRINTS["chapter"])
        weights = [section[3] for section in blueprint["sections"]]
        section_counts = _split_counts(question_count, weights)
        section_specs = []
        for (section_id, title, qtype, _weight, marks), count in zip(
            blueprint["sections"], section_counts, strict=False
        ):
            if count <= 0:
                continue
            section_specs.append(
                {
                    "id": section_id,
                    "title": f"Section {section_id} — {title}",
                    "type": qtype,
                    "count": count,
                    "marks_per_question": marks,
                }
            )
        duration = blueprint["duration"]
        written_marks = sum(spec["count"] * spec["marks_per_question"] for spec in section_specs)
        plan_label = plan_type.replace("_", " ").title()

    chapters_text = ", ".join(chapter_titles) if chapter_titles else "syllabus units covered so far"

    client = get_openai_client()
    response = client.chat.completions.create(
        model=settings.lecture_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You create Indian school exam question papers (CBSE/NCERT style). "
                    "Return ONLY valid JSON: "
                    '{"sections":[{"id":"A","title":"...","questions":[{"number":1,'
                    '"type":"mcq|very_short|short|long|case_study|map_diagram","question":"...",'
                    '"options":["(a)...","(b)..."],"marks":1}]}],"total_marks":0}. '
                    "Number questions continuously across sections. "
                    "MCQs must have four options (a)-(d). "
                    "Other types have no options. "
                    "Case study questions may include a short passage in the question text. "
                    "Map/diagram questions should ask to draw or label a diagram/map."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Create a {plan_label} written exam paper ({written_marks} marks).\n"
                    f"Class: {class_grade}\nSubject: {subject}\n"
                    f"Chapters: {chapters_text}\n"
                    f"Program: {program}\n"
                    f"Section breakdown (follow exactly): {json.dumps(section_specs)}\n"
                    f"{exam_hint}\n"
                    "Use formal CBSE wording. Written paper only — no internal assessment questions."
                ),
            },
        ],
        temperature=0.65,
        max_tokens=8192,
    )

    raw = (response.choices[0].message.content or "{}").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    try:
        generated = json.loads(raw)
        sections = generated.get("sections") or []
    except json.JSONDecodeError:
        logger.warning("Exam JSON parse failed — using fallback")
        sections = []

    if not sections:
        sections = _fallback_sections(section_specs, subject)

    total_marks = sum(int(q.get("marks") or 1) for section in sections for q in section.get("questions", []))
    if is_term_exam:
        total_marks = TERM_WRITTEN_BLUEPRINTS[plan_type]["written_marks"]

    syllabus_note = None
    if is_term_exam:
        if plan_type == "mid_term":
            syllabus_note = "Syllabus: First half of the textbook (Chapters 1 to midpoint)."
        else:
            syllabus_note = "Syllabus: Complete textbook (all chapters)."

    return {
        "exam_meta": {
            "board_style": "CBSE / NCERT",
            "class_grade": class_grade,
            "subject": subject,
            "plan_type": plan_type,
            "exam_label": plan_label if is_term_exam else plan_type.replace("_", " ").title(),
            "duration_minutes": duration,
            "total_marks": total_marks,
            "written_marks": total_marks,
            "chapters": chapter_titles,
            "syllabus_note": syllabus_note,
            "instructions": INDIAN_INSTRUCTIONS,
            "general_instructions": [
                "This question paper contains multiple sections (A to F).",
                "Write your answers on the ruled answer sheet provided by your school.",
                "When finished, return to the portal and scan the QR code to upload photos of your answers.",
            ],
            "section_pattern": section_specs if is_term_exam else None,
        },
        "sections": sections,
    }


def _fallback_question(spec: dict, subject: str, index: int) -> dict:
    qtype = spec["type"]
    prompts = {
        "mcq": (f"Which of the following is correct regarding {subject}?", "mcq"),
        "very_short": (f"Define one key term from {subject}.", "very_short"),
        "short": (f"Explain an important concept from {subject}.", "short"),
        "long": (f"Describe in detail a major topic from {subject} with examples.", "long"),
        "case_study": (
            f"Read the following source-based passage about {subject} and answer: "
            "What is the main idea conveyed?",
            "case_study",
        ),
        "map_diagram": (
            f"Draw and label a diagram relevant to {subject} (or mark locations on the map if applicable).",
            "map_diagram",
        ),
    }
    text, resolved_type = prompts.get(qtype, (f"Answer the following from {subject}.", qtype))
    question: dict = {
        "number": index,
        "type": resolved_type,
        "question": text,
        "marks": spec["marks_per_question"],
    }
    if resolved_type == "mcq":
        question["options"] = ["(a) Option 1", "(b) Option 2", "(c) Option 3", "(d) Option 4"]
    return question


def _fallback_sections(section_specs: list[dict], subject: str) -> list[dict]:
    sections = []
    number = 1
    for spec in section_specs:
        questions = [_fallback_question(spec, subject, number + i) for i in range(spec["count"])]
        number += spec["count"]
        sections.append({"id": spec["id"], "title": spec["title"], "questions": questions})
    return sections


def generate_mcq_questions(
    *,
    subject: str,
    class_grade: int,
    chapter_titles: list[str],
    question_count: int = 15,
    program: str = "school",
) -> list[dict]:
    """Digital MCQ quiz — flat question list with answers for on-screen attempt."""
    program = normalize_program(program)
    exam_hint = practice_exam_hint(program)
    chapters_text = ", ".join(chapter_titles) if chapter_titles else "syllabus covered so far"
    count = max(5, min(question_count, 30))

    client = get_openai_client()
    response = client.chat.completions.create(
        model=settings.classification_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Create multiple-choice questions for Indian school students. "
                    'Return ONLY valid JSON array: '
                    '[{"question":"...","options":["(a)...","(b)...","(c)...","(d)..."],"answer":"a"}]. '
                    "answer must be a single letter a/b/c/d matching the correct option."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Subject: {subject}\nClass: {class_grade}\nChapters: {chapters_text}\n"
                    f"Create {count} MCQs.\n{exam_hint}"
                ),
            },
        ],
        temperature=0.6,
        max_tokens=4096,
    )
    raw = (response.choices[0].message.content or "[]").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and parsed:
            cleaned = []
            for item in parsed[:count]:
                if not isinstance(item, dict):
                    continue
                answer = str(item.get("answer", "a")).strip().lower()[:1] or "a"
                cleaned.append(
                    {
                        "question": str(item.get("question") or "Question"),
                        "options": item.get("options") or ["(a) Option A", "(b) Option B", "(c) Option C", "(d) Option D"],
                        "answer": answer,
                    }
                )
            if cleaned:
                return cleaned
    except json.JSONDecodeError:
        logger.warning("MCQ JSON parse failed — using fallback")

    return [
        {
            "question": f"Sample question {i + 1} about {subject}",
            "options": ["(a) First", "(b) Second", "(c) Third", "(d) Fourth"],
            "answer": "a",
        }
        for i in range(min(count, 10))
    ]


def create_practice_paper_for_student(
    *,
    student_id: int,
    subject: str,
    class_grade: int,
    plan_type: str,
    chapter_ids: list[int],
    question_count: int,
    title: str,
    template_id: int | None = None,
    program: str = "school",
    school_id: int | None = None,
) -> PracticePaper:
    if plan_type in ("mid_term", "full_term") and school_id:
        chapter_ids = resolve_chapter_ids_for_term_exam(
            school_id=school_id,
            subject=subject,
            class_grade=class_grade,
            plan_type=plan_type,
            program=program,
        )

    chapter_titles = _chapter_titles(chapter_ids)

    if plan_type == "mcq":
        questions = generate_mcq_questions(
            subject=subject,
            class_grade=class_grade,
            chapter_titles=chapter_titles,
            question_count=question_count or 15,
            program=program,
        )
        upload_token = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=24)
        db = SessionLocal()
        try:
            paper = PracticePaper(
                student_id=student_id,
                template_id=template_id,
                title=title or f"{subject} — Quick MCQ Quiz",
                subject=subject,
                plan_type=plan_type,
                class_grade=class_grade,
                chapter_ids_json=json.dumps(chapter_ids),
                questions_json=json.dumps(questions, ensure_ascii=False),
                total_marks=len(questions),
                total_questions=len(questions),
                status="in_progress",
                upload_token=upload_token,
                upload_token_expires=expires,
            )
            db.add(paper)
            db.commit()
            db.refresh(paper)
            return paper
        finally:
            db.close()

    exam = generate_indian_exam_paper(
        subject=subject,
        class_grade=class_grade,
        plan_type=plan_type,
        chapter_titles=chapter_titles,
        question_count=question_count,
        program=program,
    )
    total_marks = exam.get("exam_meta", {}).get("total_marks") or question_count
    duration_minutes = int(exam.get("exam_meta", {}).get("duration_minutes") or 60)
    now = datetime.utcnow()
    upload_token = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=24)

    db = SessionLocal()
    try:
        paper = PracticePaper(
            student_id=student_id,
            template_id=template_id,
            title=title,
            subject=subject,
            plan_type=plan_type,
            class_grade=class_grade,
            chapter_ids_json=json.dumps(chapter_ids),
            questions_json=json.dumps(exam, ensure_ascii=False),
            total_marks=total_marks,
            status="in_progress",
            upload_token=upload_token,
            upload_token_expires=expires,
            started_at=now,
            ends_at=now + timedelta(minutes=max(duration_minutes, 1)),
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)
        return paper
    finally:
        db.close()
