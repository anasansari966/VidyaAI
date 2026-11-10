#!/usr/bin/env python3
"""
Initialize VidyaAI database (first deploy on empty Supabase).

Usage (from backend/ with venv active):

  python scripts/init_db.py

Requires DATABASE_URL in .env, e.g. Supabase direct connection:

  DATABASE_URL=postgresql+psycopg2://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require

Or set SUPABASE_URL + SUPABASE_DB_PASSWORD (legacy).

Options:
  --no-seed          Skip demo users and practice seed data
  --migrate-columns  Run legacy ALTER TABLE for old databases (not needed on fresh Supabase)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings  # noqa: E402
from app.db.init_database import initialize_database, is_database_uninitialized  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize VidyaAI database schema and seed data")
    parser.add_argument("--no-seed", action="store_true", help="Do not insert demo users")
    parser.add_argument(
        "--migrate-columns",
        action="store_true",
        help="Run ALTER TABLE for legacy DBs (skip on fresh Supabase)",
    )
    parser.add_argument("--force", action="store_true", help="Run even if core tables already exist")
    args = parser.parse_args()

    db_target = settings.resolved_database_url
    if "@" in db_target:
        db_target = db_target.split("@", 1)[1]
    print(f"Database: {db_target}")

    if not args.force and not is_database_uninitialized():
        print("Core tables already exist. Use --force to re-run seed/migrations anyway.")
        return 0

    initialize_database(
        seed_demo=not args.no_seed,
        migrate_legacy_columns=args.migrate_columns,
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
