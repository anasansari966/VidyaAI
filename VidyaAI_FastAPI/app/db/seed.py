import json
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import School, User
from app.models.access_role import AccessRole
from app.models.practice import PracticePaper, PracticePlanType
from app.models.user import UserRole
from app.constants.service_permissions import permissions_to_json
from app.db.schema_migrations import add_column_if_missing
from app.utils.security import hash_password


def ensure_demo_lead_columns(db: Session, is_sqlite: bool) -> None:
    add_column_if_missing(
        db, is_sqlite=is_sqlite, table="demo_leads", column="status", definition="VARCHAR(30) DEFAULT 'new'"
    )
    add_column_if_missing(
        db, is_sqlite=is_sqlite, table="demo_leads", column="admin_notes", definition="TEXT"
    )
    db.execute(text("UPDATE demo_leads SET status='new' WHERE status IS NULL OR status=''"))
    db.commit()


def ensure_schema_columns(db: Session, is_sqlite: bool) -> None:
    ensure_demo_lead_columns(db, is_sqlite)
    columns = [
        ("users", "access_role_id", "INTEGER"),
        ("users", "phone", "VARCHAR(30)"),
        ("users", "parent_name", "VARCHAR(255)"),
        ("users", "parent_phone", "VARCHAR(30)"),
        ("schools", "default_access_role_id", "INTEGER"),
        ("schools", "enabled_class_grades_json", "TEXT"),
        ("schools", "student_limits_json", "TEXT"),
        ("books", "processing_progress", "INTEGER DEFAULT 0"),
        ("books", "processing_message", "VARCHAR(255)"),
        ("books", "total_pdf_pages", "INTEGER"),
        ("books", "content_language", "VARCHAR(20)"),
        ("books", "file_hash", "VARCHAR(64)"),
        ("chapters", "pdf_start_page", "INTEGER"),
        ("chapters", "pdf_end_page", "INTEGER"),
        ("chapters", "source_file_path", "VARCHAR(500)"),
        ("chapters", "source_file_type", "VARCHAR(20)"),
        ("chapters", "source_chapter_number", "INTEGER"),
        ("lecture_parts", "lecture_persona", "VARCHAR(20)"),
        ("practice_papers", "class_grade", "INTEGER"),
        ("practice_papers", "total_marks", "INTEGER"),
        ("practice_papers", "status", "VARCHAR(30) DEFAULT 'in_progress'"),
        ("practice_papers", "upload_token", "VARCHAR(64)"),
        ("practice_papers", "upload_token_expires", "TIMESTAMP"),
        ("practice_papers", "answer_sheet_paths", "TEXT"),
        ("practice_papers", "answer_images_json", "TEXT"),
        ("practice_papers", "evaluation_json", "TEXT"),
        ("practice_papers", "started_at", "TIMESTAMP"),
        ("practice_papers", "ends_at", "TIMESTAMP"),
        ("users", "subscription_plan", "VARCHAR(40)"),
        ("users", "subscription_status", "VARCHAR(30)"),
        ("users", "subscription_expires_at", "TIMESTAMP"),
        ("users", "email_verified", "BOOLEAN DEFAULT FALSE"),
        ("users", "subscription_cycle", "VARCHAR(20)"),
        ("users", "city", "VARCHAR(120)"),
        ("users", "board", "VARCHAR(40)"),
        ("users", "enrolled_school_name", "VARCHAR(255)"),
        ("student_leads", "billing_cycle", "VARCHAR(20)"),
        ("student_leads", "parent_name", "VARCHAR(255)"),
        ("student_leads", "parent_phone", "VARCHAR(30)"),
        ("student_leads", "school_name", "VARCHAR(255)"),
        ("student_leads", "city", "VARCHAR(120)"),
        ("student_leads", "board", "VARCHAR(40)"),
    ]
    for table, column, definition in columns:
        add_column_if_missing(db, is_sqlite=is_sqlite, table=table, column=column, definition=definition)
    try:
        db.execute(
            text(
                """
                UPDATE users
                SET email_verified = TRUE
                WHERE (email_verified IS NULL OR email_verified = FALSE)
                  AND (
                    subscription_status IS NULL
                    OR subscription_status IN ('school_managed', 'active')
                  )
                """
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    if is_sqlite:
        db.commit()


def repair_postgres_enums(db: Session) -> None:
    """Convert legacy Postgres ENUM columns to VARCHAR with lowercase values."""
    import logging

    log = logging.getLogger(__name__)
    enum_columns = [
        ("users", "role", "userrole", 30),
        ("books", "status", "bookstatus", 30),
        ("chapters", "status", "chapterstatus", 30),
        ("lecture_parts", "status", "lecturestatus", 30),
        ("lecture_schedules", "status", "schedulestatus", 30),
    ]
    for table, column, enum_type, width in enum_columns:
        try:
            db.execute(
                text(
                    f"""
                    DO $$
                    BEGIN
                      IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = '{table}'
                          AND column_name = '{column}'
                          AND udt_name = '{enum_type}'
                      ) THEN
                        EXECUTE 'ALTER TABLE {table} ALTER COLUMN {column} '
                          || 'TYPE VARCHAR({width}) USING lower({column}::text)';
                        EXECUTE 'DROP TYPE IF EXISTS {enum_type}';
                      END IF;
                    END $$;
                    """
                )
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            log.warning("Postgres enum repair skipped for %s.%s: %s", table, column, exc)


def seed_access_roles(db: Session) -> dict[str, int]:
    """Create default service access roles (idempotent)."""
    defaults = [
        {
            "name": "Full Access",
            "description": "All student services enabled",
            "permissions": ["schedule", "lectures", "recordings", "practice", "support"],
            "is_system": True,
        },
        {
            "name": "Lectures Only",
            "description": "Live classes and recordings only",
            "permissions": ["lectures", "recordings"],
            "is_system": True,
        },
        {
            "name": "Lectures + Support",
            "description": "Classes, recordings, and help desk",
            "permissions": ["lectures", "recordings", "support"],
            "is_system": True,
        },
        {
            "name": "Practice Only",
            "description": "Practice papers and assessments only",
            "permissions": ["practice"],
            "is_system": True,
        },
        {
            "name": "Lectures + Practice",
            "description": "Classes, recordings, and practice",
            "permissions": ["lectures", "recordings", "practice"],
            "is_system": True,
        },
    ]
    role_ids: dict[str, int] = {}
    for spec in defaults:
        role = db.query(AccessRole).filter(AccessRole.name == spec["name"]).first()
        if not role:
            role = AccessRole(
                name=spec["name"],
                description=spec["description"],
                permissions_json=permissions_to_json(spec["permissions"]),
                is_system=spec["is_system"],
            )
            db.add(role)
            db.flush()
        role_ids[spec["name"]] = role.id
    db.commit()
    return role_ids


def migrate_legacy_demo_accounts(db: Session) -> None:
    """Merge retired demo emails into current accounts before seeding new rows."""
    school_admin = db.query(User).filter(User.email == "school-admin@demo.edu").first()
    legacy_admin = db.query(User).filter(User.email == "admin@demo.edu").first()

    if legacy_admin:
        if school_admin and school_admin.id != legacy_admin.id:
            db.delete(legacy_admin)
        else:
            legacy_admin.email = "school-admin@demo.edu"
            legacy_admin.full_name = "Priya Sharma (School Admin)"
            legacy_admin.program = "school"
            legacy_admin.role = UserRole.ADMIN

    jee_student = db.query(User).filter(User.email == "jee@demo.edu").first()
    legacy_student = db.query(User).filter(User.email == "competitive@demo.edu").first()
    if legacy_student:
        if jee_student and jee_student.id != legacy_student.id:
            db.delete(legacy_student)
        else:
            legacy_student.email = "jee@demo.edu"
            legacy_student.program = "jee"
            if not legacy_student.exam_track:
                legacy_student.exam_track = "mains"

    db.flush()


# Demo International School — rotated credentials (force-reset on every seed).
DEMO_SUPER_ADMIN_EMAIL = "superadmin@edu.com"
DEMO_SUPER_ADMIN_PASSWORD = "SuperAdmin@2026"
DEMO_SCHOOL_ADMIN_EMAIL = "school-admin@demo.edu"
DEMO_SCHOOL_ADMIN_PASSWORD = "SchoolAdmin@2026"
DEMO_CHILD_RAHUL_EMAIL = "student@demo.edu"
DEMO_CHILD_RAHUL_PASSWORD = "ChildRahul@2026"
DEMO_CHILD_ANANYA_EMAIL = "ananya@demo.edu"
DEMO_CHILD_ANANYA_PASSWORD = "ChildAnanya@2026"
DEMO_PARENT_PHONE = "9876543210"
DEMO_PARENT_PASSWORD = "ParentVerma@2026"
DEMO_PARENT_NAME = "Mr. Rajesh Verma"

RETIRED_DEMO_EMAILS = (
    "jee-admin@demo.edu",
    "neet-admin@demo.edu",
    "govt-admin@demo.edu",
    "jee@demo.edu",
    "neet@demo.edu",
    "govt@demo.edu",
    "admin@demo.edu",
    "competitive@demo.edu",
)


def _upsert_demo_user(db: Session, demo_school: School, account: dict) -> User:
    existing = db.query(User).filter(User.email == account["email"]).first()
    if existing:
        existing.hashed_password = hash_password(account["password"])
        existing.program = account["program"]
        existing.exam_track = account.get("exam_track")
        existing.full_name = account["full_name"]
        existing.role = account["role"]
        existing.is_active = True
        if account.get("phone"):
            existing.phone = account["phone"]
        if account.get("parent_name"):
            existing.parent_name = account["parent_name"]
        if account.get("parent_phone"):
            existing.parent_phone = account["parent_phone"]
        if existing.school_id is None and account["role"] != UserRole.SUPER_ADMIN:
            existing.school_id = demo_school.id
        if account["role"] == UserRole.STUDENT:
            if account.get("access_role_id"):
                existing.access_role_id = account["access_role_id"]
            if account.get("class_grade") is not None:
                existing.class_grade = account["class_grade"]
        existing.email_verified = True
        return existing

    user = User(
        email=account["email"],
        hashed_password=hash_password(account["password"]),
        full_name=account["full_name"],
        role=account["role"],
        school_id=None if account["role"] == UserRole.SUPER_ADMIN else demo_school.id,
        class_grade=account.get("class_grade"),
        program=account["program"],
        exam_track=account.get("exam_track"),
        access_role_id=account.get("access_role_id"),
        phone=account.get("phone"),
        parent_name=account.get("parent_name"),
        parent_phone=account.get("parent_phone"),
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _retire_legacy_demo_accounts(db: Session) -> None:
    """Invalidate retired multi-program demo logins (school-only demo now)."""
    from app.models.user import AccountStatus

    locked = hash_password("RETIRED-DEMO-NO-LOGIN")
    for email in RETIRED_DEMO_EMAILS:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            continue
        user.hashed_password = locked
        user.is_active = False
        user.account_status = AccountStatus.SUSPENDED.value
        user.status_note = "Retired demo account — use Demo International School credentials."


def _seed_demo_parent_links(db: Session, demo_school: School, student_emails: list[str]) -> None:
    from app.services.parent_service import get_or_create_parent, link_parent_to_student

    parent = get_or_create_parent(
        db,
        phone=DEMO_PARENT_PHONE,
        password=DEMO_PARENT_PASSWORD,
        full_name=DEMO_PARENT_NAME,
        school_id=demo_school.id,
    )
    for email in student_emails:
        student = (
            db.query(User)
            .filter(
                User.email == email,
                User.school_id == demo_school.id,
                User.role == UserRole.STUDENT,
            )
            .first()
        )
        if student:
            link_parent_to_student(db, parent_id=parent.id, student_id=student.id)


def seed_demo_users(db: Session) -> None:
    """Create one demo school with admin, children, and a linked parent (idempotent)."""
    import logging

    log = logging.getLogger(__name__)
    migrate_legacy_demo_accounts(db)
    role_ids = seed_access_roles(db)
    full_access_id = role_ids["Full Access"]

    demo_school = db.query(School).filter(School.name == "Demo International School").first()
    if not demo_school:
        demo_school = School(
            name="Demo International School",
            organization_type="school",
            default_access_role_id=full_access_id,
            address="123 Education Lane",
        )
        db.add(demo_school)
        db.flush()
    elif demo_school.default_access_role_id is None:
        demo_school.default_access_role_id = full_access_id

    for school in db.query(School).filter(School.default_access_role_id.is_(None)).all():
        school.default_access_role_id = full_access_id

    _retire_legacy_demo_accounts(db)

    demo_accounts = [
        {
            "email": DEMO_SUPER_ADMIN_EMAIL,
            "password": DEMO_SUPER_ADMIN_PASSWORD,
            "full_name": "Demo Super Admin",
            "role": UserRole.SUPER_ADMIN,
            "class_grade": None,
            "program": "school",
            "exam_track": None,
            "access_role_id": None,
        },
        {
            "email": DEMO_SCHOOL_ADMIN_EMAIL,
            "password": DEMO_SCHOOL_ADMIN_PASSWORD,
            "full_name": "Priya Sharma (School Admin)",
            "role": UserRole.ADMIN,
            "class_grade": None,
            "program": "school",
            "exam_track": None,
            "access_role_id": None,
        },
        {
            "email": DEMO_CHILD_RAHUL_EMAIL,
            "password": DEMO_CHILD_RAHUL_PASSWORD,
            "full_name": "Rahul Verma",
            "role": UserRole.STUDENT,
            "class_grade": 9,
            "program": "school",
            "exam_track": None,
            "access_role_id": full_access_id,
            "phone": "9876501001",
            "parent_name": DEMO_PARENT_NAME,
            "parent_phone": DEMO_PARENT_PHONE,
        },
        {
            "email": DEMO_CHILD_ANANYA_EMAIL,
            "password": DEMO_CHILD_ANANYA_PASSWORD,
            "full_name": "Ananya Verma",
            "role": UserRole.STUDENT,
            "class_grade": 10,
            "program": "school",
            "exam_track": None,
            "access_role_id": full_access_id,
            "phone": "9876501002",
            "parent_name": DEMO_PARENT_NAME,
            "parent_phone": DEMO_PARENT_PHONE,
        },
    ]

    for account in demo_accounts:
        _upsert_demo_user(db, demo_school, account)

    _seed_demo_parent_links(
        db,
        demo_school,
        [DEMO_CHILD_RAHUL_EMAIL, DEMO_CHILD_ANANYA_EMAIL],
    )

    try:
        from app.services.billing_service import ensure_individual_school

        ensure_individual_school(db)
    except Exception:
        pass

    db.commit()
    log.info(
        "Demo credentials ready | school=%s | admin=%s | parent_phone=%s | children=%s,%s",
        demo_school.name,
        DEMO_SCHOOL_ADMIN_EMAIL,
        DEMO_PARENT_PHONE,
        DEMO_CHILD_RAHUL_EMAIL,
        DEMO_CHILD_ANANYA_EMAIL,
    )


def seed_demo_practice_results(db: Session) -> None:
    demo_school = db.query(School).filter(School.name == "Demo International School").first()
    if not demo_school:
        return

    samples = [
        (DEMO_CHILD_RAHUL_EMAIL, "Mathematics Mid Term", "Mathematics", PracticePlanType.MID_TERM.value, 8, 10),
        (DEMO_CHILD_RAHUL_EMAIL, "Science Chapter Test", "Science", PracticePlanType.CHAPTER.value, 7, 10),
        (DEMO_CHILD_RAHUL_EMAIL, "English Chapter Quiz", "English", PracticePlanType.CHAPTER.value, 6, 10),
        (DEMO_CHILD_ANANYA_EMAIL, "Mathematics Half Term", "Mathematics", PracticePlanType.HALF_TERM.value, 16, 20),
        (DEMO_CHILD_ANANYA_EMAIL, "Science Assessment", "Science", PracticePlanType.ASSESSMENT.value, 14, 20),
        (DEMO_CHILD_ANANYA_EMAIL, "History Chapter Test", "History", PracticePlanType.CHAPTER.value, 9, 10),
    ]

    for email, title, subject, plan_type, score, total in samples:
        student = (
            db.query(User)
            .filter(User.email == email, User.school_id == demo_school.id)
            .first()
        )
        if not student:
            continue
        exists = (
            db.query(PracticePaper)
            .filter(
                PracticePaper.student_id == student.id,
                PracticePaper.title == title,
                PracticePaper.submitted_at.isnot(None),
            )
            .first()
        )
        if exists:
            continue

        questions = [
            {
                "question": f"{subject} sample question {i + 1}",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "answer": "A",
                "explanation": "Demo explanation.",
            }
            for i in range(total)
        ]
        db.add(
            PracticePaper(
                student_id=student.id,
                title=title,
                subject=subject,
                plan_type=plan_type,
                questions_json=json.dumps(questions),
                score=score,
                total_questions=total,
                submitted_at=datetime.utcnow() - timedelta(days=total % 7 + 1),
            )
        )

    db.commit()


def run_postgres_backfills(db: Session, is_sqlite: bool) -> None:
    if is_sqlite:
        db.execute(text("UPDATE users SET track='jee' WHERE track='competitive'"))
        db.execute(text("UPDATE books SET track='jee' WHERE track='competitive'"))
        db.execute(text("UPDATE practice_templates SET track='jee' WHERE track='competitive'"))
        db.execute(
            text(
                "UPDATE users SET account_status='active' "
                "WHERE account_status IS NULL OR account_status=''"
            )
        )
        db.execute(
            text(
                "UPDATE users SET is_active=0 "
                "WHERE account_status IN ('suspended', 'service_stopped')"
            )
        )
        db.execute(text("UPDATE users SET is_active=1 WHERE account_status='active'"))
    else:
        db.execute(text("UPDATE users SET track='jee' WHERE track='competitive'"))
        db.execute(text("UPDATE books SET track='jee' WHERE track='competitive'"))
        db.execute(text("UPDATE practice_templates SET track='jee' WHERE track='competitive'"))
        db.execute(
            text(
                "UPDATE users SET account_status='active' "
                "WHERE account_status IS NULL OR account_status=''"
            )
        )
        db.execute(
            text(
                "UPDATE users SET is_active=false "
                "WHERE account_status IN ('suspended', 'service_stopped')"
            )
        )
        db.execute(text("UPDATE users SET is_active=true WHERE account_status='active'"))

    db.execute(
        text(
            "UPDATE books SET exam_track='mains' "
            "WHERE track='jee' AND (exam_track IS NULL OR exam_track='')"
        )
    )
    db.execute(
        text(
            "UPDATE books SET exam_track='medical' "
            "WHERE track='neet' AND (exam_track IS NULL OR exam_track='')"
        )
    )
    db.execute(
        text(
            "UPDATE books SET exam_track='upsc' "
            "WHERE track='govt' AND (exam_track IS NULL OR exam_track='')"
        )
    )
    db.commit()


def reset_postgres_sequences(db: Session) -> None:
    tables = [
        "schools",
        "users",
        "books",
        "chapters",
        "book_pages",
        "chapter_pages",
        "lecture_parts",
        "lecture_visual_frames",
        "lecture_schedules",
        "student_progress",
        "practice_templates",
        "practice_papers",
        "access_roles",
        "demo_leads",
        "student_leads",
        "email_otps",
    ]
    for table in tables:
        db.execute(
            text(
                f"""
                DO $$
                BEGIN
                  IF pg_get_serial_sequence('{table}', 'id') IS NOT NULL THEN
                    PERFORM setval(
                      pg_get_serial_sequence('{table}', 'id'),
                      COALESCE((SELECT MAX(id) FROM {table}), 1),
                      true
                    );
                  END IF;
                END $$;
                """
            )
        )
    db.commit()
