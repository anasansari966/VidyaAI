"""
Migrate local SQLite data to Supabase PostgreSQL and seed demo roles.

Usage (from backend/):
  python -m scripts.migrate_to_supabase
  python -m scripts.migrate_to_supabase --from-sqlite
  python -m scripts.migrate_to_supabase --seed-only
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402
from app.db.reset import print_demo_logins, reset_database  # noqa: E402
from app.db.seed import (  # noqa: E402
    repair_postgres_enums,
    reset_postgres_sequences,
    run_postgres_backfills,
    seed_demo_practice_results,
    seed_demo_users,
)
from app.models import (  # noqa: E402
    Book,
    BookPage,
    Chapter,
    ChapterPage,
    DemoLead,
    LecturePart,
    LectureSchedule,
    LectureVisualFrame,
    School,
    StudentProgress,
    User,
)
from app.models.practice import PracticePaper, PracticeTemplate  # noqa: E402

SQLITE_PATH = BACKEND_ROOT / "vidyaai.db"

COPY_ORDER = [
    School,
    User,
    Book,
    Chapter,
    BookPage,
    ChapterPage,
    LecturePart,
    LectureVisualFrame,
    LectureSchedule,
    StudentProgress,
    PracticeTemplate,
    PracticePaper,
    DemoLead,
]


def _require_supabase_config() -> None:
    if not settings.is_postgres:
        print("ERROR: Configure Supabase PostgreSQL in .env:")
        print("  SUPABASE_URL=https://your-project.supabase.co")
        print("  SUPABASE_KEY=your-service-role-key")
        print("  SUPABASE_DB_PASSWORD=your-database-password")
        print("  SUPABASE_DB_HOST=aws-0-us-east-1.pooler.supabase.com  # Session pooler (IPv4)")
        print("Or set DATABASE_URL to your Supabase Session pooler connection string.")
        sys.exit(1)


def _copy_rows(src_session, dst_session, model) -> int:
    table = model.__table__.name
    if dst_session.query(model).count() > 0:
        print(f"  skip {table} (already has rows)")
        return 0

    rows = src_session.query(model).all()
    for row in rows:
        payload = {column.name: getattr(row, column.name) for column in model.__table__.columns}
        dst_session.add(model(**payload))

    dst_session.flush()
    print(f"  copied {len(rows)} row(s) into {table}")
    return len(rows)


def migrate_from_sqlite(dst_session) -> None:
    if not SQLITE_PATH.exists():
        print(f"No SQLite file at {SQLITE_PATH}; skipping data copy.")
        return

    sqlite_url = f"sqlite:///{SQLITE_PATH.as_posix()}"
    src_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    SrcSession = sessionmaker(bind=src_engine)
    src_session = SrcSession()

    try:
        print("Copying data from local SQLite…")
        copied = 0
        for model in COPY_ORDER:
            copied += _copy_rows(src_session, dst_session, model)
        dst_session.commit()
        print(f"Copied {copied} total row(s).")
        reset_postgres_sequences(dst_session)
    finally:
        src_session.close()
        src_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate VidyaAI data to Supabase PostgreSQL")
    parser.add_argument(
        "--from-sqlite",
        action="store_true",
        help="Copy existing rows from backend/vidyaai.db before seeding",
    )
    parser.add_argument(
        "--seed-only",
        action="store_true",
        help="Only create tables and seed demo roles (no SQLite copy)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop all tables and rebuild schema + demo seed (destructive)",
    )
    args = parser.parse_args()

    _require_supabase_config()

    print(f"Target database: {settings.resolved_database_url.split('@')[-1]}")

    engine = create_engine(settings.resolved_database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        if args.reset:
            print("Resetting database (drop all tables + reseed)…")
            reset_database(db)
        else:
            Base.metadata.create_all(bind=engine)
            inspector = inspect(engine)
            print(f"Tables on Supabase: {', '.join(inspector.get_table_names())}")

            if args.from_sqlite and not args.seed_only:
                migrate_from_sqlite(db)

            print("Seeding demo school and role accounts…")
            if not settings.is_sqlite:
                repair_postgres_enums(db)
            seed_demo_users(db)

            print("Running backfills…")
            run_postgres_backfills(db, is_sqlite=False)

            print("Seeding demo practice results…")
            seed_demo_practice_results(db)

            reset_postgres_sequences(db)

        role_counts = db.execute(
            text("SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role")
        ).all()
        print("\nUsers by role on Supabase:")
        for role, count in role_counts:
            print(f"  {role}: {count}")

        print("\nMigration complete.")
        print_demo_logins()
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    main()
