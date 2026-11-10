"""Bulk student import from Excel with student and parent credentials."""

from __future__ import annotations

import io
import re
import secrets
import string
from dataclasses import dataclass

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy.orm import Session

from app.constants.programs import is_school_program, normalize_program
from app.models.access_role import AccessRole
from app.models.user import User, UserRole, AccountStatus
from app.services.parent_service import get_or_create_parent, link_parent_to_student
from app.utils.parent_accounts import normalize_phone, student_login_email
from app.utils.security import hash_password

IMPORT_HEADERS = {
    "name": {"name", "full name", "student name", "student_name"},
    "student_id": {"student id", "student_id", "student login", "login id"},
    "email": {"email", "email address", "student email", "student_email"},
    "student_password": {
        "student password",
        "student_password",
        "student pass",
        "password",
    },
    "phone": {"phone", "phone number", "mobile", "student phone", "phone_number"},
    "parent_phone": {
        "parents phone number",
        "parent phone number",
        "parent phone",
        "parents phone",
        "parent_phone",
        "guardian phone",
        "parents number",
        "parent number",
    },
    "parent_name": {
        "parents name",
        "parent name",
        "parent_name",
        "guardian name",
        "father name",
        "mother name",
    },
    "parent_password": {
        "parents password",
        "parent password",
        "parent_password",
        "parents_password",
        "parent pass",
        "parents pass",
    },
}

EXPORT_HEADERS = [
    "School",
    "Class / Track",
    "Student Name",
    "Parent Name",
    "Student Login ID",
    "Student Password",
    "Parent Mobile",
    "Parent Password",
]

PROGRAM_SHORT = {
    "school": "School",
    "jee": "JEE",
    "neet": "NEET",
    "govt": "Govt Exams",
}


@dataclass
class ImportRow:
    row_number: int
    full_name: str
    email: str
    student_password: str | None
    phone: str | None
    parent_name: str | None
    parent_phone: str | None
    parent_password: str | None


@dataclass
class ImportResultRow:
    school_name: str
    full_name: str
    email: str
    student_password: str
    phone: str | None
    parent_name: str | None
    parent_phone: str | None
    parent_password: str | None
    class_label: str


def generate_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _normalize_header(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip().lower())


def _map_headers(header_row: list) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        label = _normalize_header(cell)
        if not label:
            continue
        for key, aliases in IMPORT_HEADERS.items():
            if label in aliases and key not in mapping:
                mapping[key] = idx
    missing = [field for field in ("name", "parent_phone", "parent_name") if field not in mapping]
    if missing:
        labels = {
            "name": "Student Name",
            "parent_phone": "Parents Number",
            "parent_name": "Parents Name",
        }
        raise ValueError(
            "Excel must include columns: "
            + ", ".join(labels[field] for field in missing)
            + ". Student ID, passwords, and phone are auto-generated if omitted."
        )
    return mapping


def _slug_from_name(full_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", full_name.lower()).strip(".")
    return slug or "student"


def _generate_student_email(
    full_name: str,
    *,
    row_number: int,
    student_id: str | None,
    email: str | None,
    used_emails: set[str],
    school_id: int,
) -> str:
    if email:
        return email.strip().lower()
    if student_id:
        return student_login_email(student_id, school_id)

    base = _slug_from_name(full_name)
    candidates = [
        student_login_email(base, school_id),
        student_login_email(f"{base}.{row_number}", school_id),
        student_login_email(f"{base}.{secrets.token_hex(3)}", school_id),
    ]
    for candidate in candidates:
        if candidate not in used_emails:
            return candidate
    return student_login_email(f"{base}.{secrets.token_hex(4)}", school_id)


def _class_label(program: str, class_grade: int | None, exam_track: str | None) -> str:
    if is_school_program(program) and class_grade:
        return f"Class {class_grade}"
    if exam_track:
        return exam_track.upper()
    return exam_track.upper() if exam_track else PROGRAM_SHORT.get(normalize_program(program), program)


def parse_import_rows(file_bytes: bytes, *, school_id: int) -> list[ImportRow]:
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Excel file is empty")

    header_map = _map_headers(list(rows[0]))
    parsed: list[ImportRow] = []
    used_emails: set[str] = set()

    for row_idx, row in enumerate(rows[1:], start=2):
        if not row or all(cell is None or str(cell).strip() == "" for cell in row):
            continue

        def cell(key: str) -> str | None:
            idx = header_map.get(key)
            if idx is None or idx >= len(row):
                return None
            value = row[idx]
            if value is None:
                return None
            text = str(value).strip()
            return text or None

        name = cell("name")
        if not name:
            raise ValueError(f"Row {row_idx}: Student Name is required")

        parent_phone = cell("parent_phone")
        if not parent_phone:
            raise ValueError(f"Row {row_idx}: Parents Number is required")

        parent_name = cell("parent_name")
        if not parent_name:
            raise ValueError(f"Row {row_idx}: Parents Name is required")

        email = _generate_student_email(
            name,
            row_number=row_idx,
            student_id=cell("student_id"),
            email=cell("email"),
            used_emails=used_emails,
            school_id=school_id,
        )
        used_emails.add(email)

        parsed.append(
            ImportRow(
                row_number=row_idx,
                full_name=name,
                email=email,
                student_password=cell("student_password"),
                phone=cell("phone"),
                parent_name=parent_name,
                parent_phone=parent_phone,
                parent_password=cell("parent_password"),
            )
        )

    if not parsed:
        raise ValueError("No student rows found in the Excel file")

    return parsed


def build_template_workbook() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Students"
    headers = ["Student Name", "Parents Number", "Parents Name"]
    ws.append(headers)
    ws.append(["Rahul Verma", "9876501234", "Mr. Verma"])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="4F46E5")
        cell.alignment = Alignment(horizontal="center")
    widths = [24, 18, 22]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + idx)].width = width
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def import_students_from_excel(
    db: Session,
    *,
    file_bytes: bytes,
    school_id: int,
    admin_program: str,
    admin_exam_track: str | None,
    class_grade: int | None,
    access_role_id: int | None,
    school_name: str,
) -> tuple[list[ImportResultRow], list[str]]:
    program = normalize_program(admin_program)
    rows = parse_import_rows(file_bytes, school_id=school_id)
    errors: list[str] = []
    results: list[ImportResultRow] = []

    if access_role_id is not None:
        role = db.query(AccessRole).filter(AccessRole.id == access_role_id).first()
        if not role:
            raise ValueError("Invalid access role")

    if is_school_program(program):
        if not class_grade or class_grade < 1 or class_grade > 12:
            raise ValueError("Select a valid class (1–12) before uploading")
        exam_track = None
        class_label = f"Class {class_grade}"
    else:
        class_grade = None
        exam_track = admin_exam_track
        class_label = exam_track.upper() if exam_track else PROGRAM_SHORT.get(program, program)

    parent_passwords_by_phone: dict[str, str] = {}

    for row in rows:
        existing = (
            db.query(User)
            .filter(
                User.email == row.email,
                User.school_id == school_id,
                User.role == UserRole.STUDENT,
            )
            .first()
        )
        if existing:
            errors.append(
                f"Row {row.row_number}: Student already enrolled in this school ({row.email})"
            )
            continue

        global_existing = db.query(User).filter(User.email == row.email).first()
        if global_existing:
            errors.append(f"Row {row.row_number}: Login ID already in use ({row.email})")
            continue

        student_password = row.student_password or generate_password()
        parent_phone = normalize_phone(row.parent_phone) or row.parent_phone
        parent_password = row.parent_password
        if parent_phone:
            if not parent_password:
                parent_password = parent_passwords_by_phone.get(parent_phone) or generate_password()
                parent_passwords_by_phone[parent_phone] = parent_password

        user = User(
            email=row.email,
            hashed_password=hash_password(student_password),
            full_name=row.full_name,
            role=UserRole.STUDENT,
            school_id=school_id,
            class_grade=class_grade,
            program=program,
            exam_track=exam_track,
            phone=row.phone,
            parent_name=row.parent_name,
            parent_phone=parent_phone,
            access_role_id=access_role_id,
            account_status=AccountStatus.ACTIVE.value,
            is_active=True,
        )
        db.add(user)
        db.flush()

        if parent_phone and parent_password:
            try:
                parent = get_or_create_parent(
                    db,
                    phone=parent_phone,
                    password=parent_password,
                    full_name=row.parent_name,
                    school_id=school_id,
                )
                link_parent_to_student(db, parent_id=parent.id, student_id=user.id)
            except ValueError as exc:
                errors.append(f"Row {row.row_number}: {exc}")
                db.delete(user)
                db.flush()
                continue

        results.append(
            ImportResultRow(
                school_name=school_name,
                full_name=row.full_name,
                email=row.email,
                student_password=student_password,
                phone=row.phone,
                parent_name=row.parent_name,
                parent_phone=parent_phone,
                parent_password=parent_password,
                class_label=class_label,
            )
        )

    db.commit()
    return results, errors


def build_credentials_workbook(results: list[ImportResultRow]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Login Credentials"
    ws.append(EXPORT_HEADERS)

    for row in results:
        ws.append(
            [
                row.school_name,
                row.class_label,
                row.full_name,
                row.parent_name or "",
                row.email,
                row.student_password,
                row.parent_phone or "",
                row.parent_password or "",
            ]
        )

    header_fill = PatternFill("solid", fgColor="059669")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    widths = [28, 14, 22, 20, 30, 18, 16, 18]
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + idx)].width = width

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
