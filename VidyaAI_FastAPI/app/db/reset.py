"""Drop all application tables and rebuild schema + demo seed data."""

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine
from app.db.seed import (
    ensure_schema_columns,
    repair_postgres_enums,
    reset_postgres_sequences,
    run_postgres_backfills,
    seed_demo_practice_results,
    seed_demo_users,
)

logger = logging.getLogger(__name__)


def _register_models() -> None:
    import app.models  # noqa: F401
    import app.models.practice  # noqa: F401


def _prepare_postgres_reset(db: Session) -> None:
    """Lift Supabase statement limits; try to drop API locks before destructive DDL."""
    db.execute(text("SET statement_timeout TO '0'"))
    db.execute(text("SET lock_timeout TO '120s'"))
    try:
        terminated = db.execute(
            text(
                """
                SELECT pg_terminate_backend(a.pid)
                FROM pg_stat_activity a
                WHERE a.datname = current_database()
                  AND a.pid <> pg_backend_pid()
                  AND a.application_name NOT LIKE 'Supabase%%'
                """
            )
        ).rowcount
        db.commit()
        if terminated:
            logger.info("Terminated %s other database session(s) before reset", terminated)
    except Exception as exc:
        db.rollback()
        logger.warning(
            "Could not terminate other DB sessions (%s). Stop python run.py first, then retry.",
            exc,
        )
        db.execute(text("SET statement_timeout TO '0'"))
        db.execute(text("SET lock_timeout TO '120s'"))
        db.commit()


def _recreate_public_schema(db: Session) -> None:
    """Single CASCADE drop — faster and more reliable than SQLAlchemy drop_all on Supabase."""
    db.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
    db.execute(text("CREATE SCHEMA public"))
    db.execute(text("GRANT ALL ON SCHEMA public TO postgres"))
    db.execute(text("GRANT ALL ON SCHEMA public TO public"))
    db.execute(text("GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role"))
    db.commit()


def reset_database(db: Session) -> None:
    """Recreate schema on the bound engine and seed demo data."""
    _register_models()

    if settings.is_postgres:
        _prepare_postgres_reset(db)
        _recreate_public_schema(db)
    else:
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)

    if settings.is_postgres:
        repair_postgres_enums(db)
    ensure_schema_columns(db, settings.is_sqlite)
    run_postgres_backfills(db, settings.is_sqlite)
    seed_demo_users(db)
    seed_demo_practice_results(db)

    if settings.is_postgres:
        reset_postgres_sequences(db)


def print_demo_logins() -> None:
    print("\nDemo logins:")
    print("  superadmin@edu.com / Super123!")
    print("  school-admin@demo.edu / School123!")
    print("  jee-admin@demo.edu / JeeAdmin123!")
    print("  neet-admin@demo.edu / NeetAdmin123!")
    print("  govt-admin@demo.edu / GovtAdmin123!")
    print("  student@demo.edu / Student123!")
    print("  jee@demo.edu / Jee123!")
    print("  neet@demo.edu / Neet123!")
    print("  govt@demo.edu / Govt123!")
