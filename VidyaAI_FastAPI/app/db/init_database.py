"""First-run and manual database setup for VidyaAI (Supabase Postgres or local SQLite)."""

import logging

from sqlalchemy import inspect, text

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.db.schema_migrations import acquire_startup_lock, release_startup_lock
from app.db.seed import (
    ensure_schema_columns,
    repair_postgres_enums,
    run_postgres_backfills,
    seed_demo_practice_results,
    seed_demo_users,
)

logger = logging.getLogger(__name__)

# Register every SQLAlchemy model before create_all().
import app.models  # noqa: F401
import app.models.practice  # noqa: F401


def _core_tables() -> set[str]:
    return {
        "users",
        "schools",
        "books",
        "chapters",
        "lecture_parts",
        "access_roles",
        "processing_jobs",
    }


def is_database_uninitialized() -> bool:
    """True when the database has never been set up for VidyaAI."""
    try:
        table_names = set(inspect(engine).get_table_names())
    except Exception as exc:
        # Connection errors must not look like "empty DB" or startup runs create_all and dies.
        logger.warning("Could not inspect database (will retry soft bootstrap): %s", exc)
        return False
    if not table_names:
        return True
    return not _core_tables().issubset(table_names)


def _ensure_sqlite_legacy_columns() -> None:
    if not settings.is_sqlite:
        return
    migrations = [
        "ALTER TABLE lecture_visual_frames ADD COLUMN book_page_number INTEGER",
        "ALTER TABLE lecture_visual_frames ADD COLUMN source_type VARCHAR(20) DEFAULT 'generated'",
        "ALTER TABLE users ADD COLUMN class_grade INTEGER",
        "ALTER TABLE users ADD COLUMN track VARCHAR(20) DEFAULT 'school'",
        "ALTER TABLE books ADD COLUMN track VARCHAR(20) DEFAULT 'school'",
        "ALTER TABLE books ADD COLUMN exam_track VARCHAR(50)",
        "ALTER TABLE users ADD COLUMN exam_track VARCHAR(50)",
        "ALTER TABLE users ADD COLUMN account_status VARCHAR(30) DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN status_note TEXT",
        "ALTER TABLE users ADD COLUMN access_role_id INTEGER",
        "ALTER TABLE practice_papers ADD COLUMN plan_type VARCHAR(30) DEFAULT 'chapter'",
        "ALTER TABLE practice_papers ADD COLUMN score INTEGER",
        "ALTER TABLE practice_papers ADD COLUMN total_questions INTEGER",
        "ALTER TABLE practice_papers ADD COLUMN submitted_at DATETIME",
        "ALTER TABLE books ADD COLUMN processing_progress INTEGER DEFAULT 0",
        "ALTER TABLE books ADD COLUMN processing_message VARCHAR(255)",
        "ALTER TABLE books ADD COLUMN total_pdf_pages INTEGER",
        "ALTER TABLE chapters ADD COLUMN pdf_start_page INTEGER",
        "ALTER TABLE chapters ADD COLUMN pdf_end_page INTEGER",
        "ALTER TABLE chapters ADD COLUMN source_file_path VARCHAR(500)",
        "ALTER TABLE chapters ADD COLUMN source_file_type VARCHAR(20)",
        "ALTER TABLE chapters ADD COLUMN source_chapter_number INTEGER",
        "ALTER TABLE books ADD COLUMN content_language VARCHAR(20)",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass


def initialize_database(
    *,
    seed_demo: bool = True,
    migrate_legacy_columns: bool = False,
) -> None:
    """
    Create all product tables and seed demo data.

    Use on a fresh Supabase project (empty public schema).
    On Postgres, tables are created from SQLAlchemy models — no ALTER TABLE needed.
    """
    logger.info("Initializing VidyaAI database (%s)", settings.resolved_database_url.split("@")[-1])

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_legacy_columns()

    db = SessionLocal()
    lock_held = False
    try:
        lock_held = acquire_startup_lock(db, is_sqlite=settings.is_sqlite)
        if migrate_legacy_columns and (settings.is_sqlite or settings.run_startup_ddl):
            if settings.is_postgres:
                repair_postgres_enums(db)
            ensure_schema_columns(db, settings.is_sqlite)

        run_postgres_backfills(db, settings.is_sqlite)
        if seed_demo:
            seed_demo_users(db)
            seed_demo_practice_results(db)
    except Exception:
        db.rollback()
        raise
    finally:
        if lock_held:
            release_startup_lock(db, is_sqlite=settings.is_sqlite)
        db.close()

    logger.info("Database initialization complete")


def bootstrap_on_startup() -> None:
    """Called from FastAPI startup — full init on empty DB, light touch otherwise."""
    if is_database_uninitialized():
        logger.info("Empty database detected — running first-time setup")
        initialize_database(seed_demo=True, migrate_legacy_columns=False)
        return

    Base.metadata.create_all(bind=engine)
    if settings.is_sqlite:
        _ensure_sqlite_legacy_columns()

    db = SessionLocal()
    lock_held = False
    try:
        lock_held = acquire_startup_lock(db, is_sqlite=settings.is_sqlite)
        if lock_held:
            ensure_schema_columns(db, settings.is_sqlite)
            if settings.run_startup_ddl and settings.is_postgres:
                repair_postgres_enums(db)

        run_postgres_backfills(db, settings.is_sqlite)
        seed_demo_users(db)
        seed_demo_practice_results(db)
    except Exception as exc:
        db.rollback()
        logger.exception("Startup database step failed: %s", exc)
        if settings.is_sqlite:
            raise
        logger.warning("Continuing API startup despite DB step failure (Postgres)")
    finally:
        if lock_held:
            release_startup_lock(db, is_sqlite=settings.is_sqlite)
        db.close()
