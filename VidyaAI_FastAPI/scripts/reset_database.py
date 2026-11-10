"""
Drop all tables and rebuild the VidyaAI database with fresh demo seed data.

Usage (from backend/):
  python -m scripts.reset_database
  python -m scripts.reset_database --yes
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
from app.db.reset import print_demo_logins, reset_database  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset VidyaAI database schema and demo seed")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    args = parser.parse_args()

    target = settings.resolved_database_url.split("@")[-1]
    print(f"Target database: {target}")

    if not args.yes:
        print("\nWARNING: This deletes ALL tables and data, then recreates schema + demo accounts.")
        print("Stop the API server (python run.py) first so it does not hold database locks.")
        confirm = input("Type RESET to continue: ").strip()
        if confirm != "RESET":
            print("Aborted.")
            sys.exit(1)

    db = SessionLocal()
    try:
        print("\nDropping and recreating all tables…")
        reset_database(db)

        role_counts = db.execute(text("SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role")).all()
        access_roles = db.execute(text("SELECT COUNT(*) FROM access_roles")).scalar()

        print("\nReset complete.")
        print(f"Access roles: {access_roles}")
        print("Users by role:")
        for role, count in role_counts:
            print(f"  {role}: {count}")

        print_demo_logins()
    except Exception as exc:
        db.rollback()
        print(f"\nERROR: Reset failed: {exc}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
