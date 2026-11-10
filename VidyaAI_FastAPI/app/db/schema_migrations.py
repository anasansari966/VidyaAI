"""Safe Postgres/SQLite startup migrations for multi-worker deployments."""

import logging
import time

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

STARTUP_MIGRATION_LOCK_ID = 847291035


def _column_exists(db: Session, table: str, column: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = :column_name
            LIMIT 1
            """
        ),
        {"table_name": table, "column_name": column},
    ).first()
    return row is not None


def acquire_startup_lock(db: Session, *, is_sqlite: bool, wait_seconds: int = 90) -> bool:
    """Ensure only one API worker runs DDL against Supabase at a time."""
    if is_sqlite:
        return True

    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        acquired = db.execute(
            text("SELECT pg_try_advisory_lock(:lock_id)"),
            {"lock_id": STARTUP_MIGRATION_LOCK_ID},
        ).scalar()
        if acquired:
            return True
        time.sleep(1)

    logger.warning("Timed out waiting for startup migration lock; skipping DDL this worker")
    return False


def release_startup_lock(db: Session, *, is_sqlite: bool) -> None:
    if is_sqlite:
        return
    db.execute(
        text("SELECT pg_advisory_unlock(:lock_id)"),
        {"lock_id": STARTUP_MIGRATION_LOCK_ID},
    )


def add_column_if_missing(
    db: Session,
    *,
    is_sqlite: bool,
    table: str,
    column: str,
    definition: str,
) -> None:
    if not is_sqlite and _column_exists(db, table, column):
        return

    stmt = f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
    if not is_sqlite:
        stmt = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"

    try:
        db.execute(text(stmt))
        if not is_sqlite:
            db.commit()
    except Exception as exc:
        db.rollback()
        if is_sqlite:
            return
        if _column_exists(db, table, column):
            return
        logger.warning("Could not add column %s.%s: %s", table, column, exc)
