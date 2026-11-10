"""
Delete all VidyaAI application data from Supabase/Postgres but keep super_admin users.

Usage (from backend/ with venv active):
  python scripts/purge_data_keep_superadmin.py
  python scripts/purge_data_keep_superadmin.py --yes
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.user import UserRole  # noqa: E402

# Child tables first (FK-safe order)
_PURGE_TABLES = [
    "lecture_visual_frames",
    "student_progress",
    "chapter_pages",
    "lecture_parts",
    "lecture_schedules",
    "chapters",
    "book_pages",
    "document_chunks",
    "subject_agents",
    "processing_jobs",
    "books",
    "practice_papers",
    "practice_templates",
    "book_structure_cache",
    "demo_leads",
    "student_leads",
    "email_otps",
]


def purge_data_keep_superadmin(db) -> dict[str, int]:
    counts: dict[str, int] = {}

    if settings.is_postgres:
        db.execute(text("SET statement_timeout TO '0'"))
        db.execute(text("SET lock_timeout TO '120s'"))
        try:
            db.execute(
                text(
                    """
                    SELECT pg_terminate_backend(a.pid)
                    FROM pg_stat_activity a
                    WHERE a.datname = current_database()
                      AND a.pid <> pg_backend_pid()
                      AND a.application_name NOT LIKE 'Supabase%%'
                    """
                )
            )
            db.commit()
        except Exception:
            db.rollback()
            db.execute(text("SET statement_timeout TO '0'"))
            db.commit()

    for table in _PURGE_TABLES:
        result = db.execute(text(f"DELETE FROM {table}"))
        counts[table] = result.rowcount or 0

    superadmins = db.execute(
        text("SELECT id, email FROM users WHERE role = :role"),
        {"role": UserRole.SUPER_ADMIN.value},
    ).all()

    if not superadmins:
        raise RuntimeError("No super_admin user found — aborting to avoid locking yourself out.")

    db.execute(
        text(
            "UPDATE users SET school_id = NULL, access_role_id = NULL "
            "WHERE role = :role"
        ),
        {"role": UserRole.SUPER_ADMIN.value},
    )

    deleted_users = db.execute(
        text("DELETE FROM users WHERE role != :role"),
        {"role": UserRole.SUPER_ADMIN.value},
    ).rowcount or 0
    counts["users_deleted"] = deleted_users

    counts["schools"] = db.execute(text("DELETE FROM schools")).rowcount or 0
    counts["access_roles"] = db.execute(text("DELETE FROM access_roles")).rowcount or 0

    db.commit()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Purge all VidyaAI data but keep super_admin account(s)"
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    target = settings.resolved_database_url.split("@")[-1]
    print(f"Target database: {target}")

    if not args.yes:
        print(
            "\nWARNING: Deletes ALL schools, books, users (except super_admin), "
            "practice data, leads, and caches. Schema is kept."
        )
        confirm = input("Type PURGE to continue: ").strip()
        if confirm != "PURGE":
            print("Aborted.")
            return 1

    db = SessionLocal()
    try:
        superadmins = db.execute(
            text("SELECT email FROM users WHERE role = :role"),
            {"role": UserRole.SUPER_ADMIN.value},
        ).all()
        if not superadmins:
            print("ERROR: No super_admin user in database.")
            return 1

        print("Keeping super_admin:")
        for (email,) in superadmins:
            print(f"  {email}")

        counts = purge_data_keep_superadmin(db)
        print("\nPurge complete.")
        print(f"  Users removed: {counts.get('users_deleted', 0)}")
        print(f"  Schools removed: {counts.get('schools', 0)}")
        print(f"  Books removed: {counts.get('books', 0)}")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"\nERROR: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
