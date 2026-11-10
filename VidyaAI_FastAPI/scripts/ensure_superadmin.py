"""
Create or update the super_admin account.

Usage (from backend/):
  python scripts/ensure_superadmin.py
  python scripts/ensure_superadmin.py --email superadmin@edu.com --password "Super123!"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import SessionLocal  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


def ensure_superadmin(email: str, password: str, full_name: str = "Super Admin") -> None:
    db = SessionLocal()
    try:
        conflict = db.query(User).filter(User.email == email, User.role != UserRole.SUPER_ADMIN).first()
        if conflict:
            raise RuntimeError(f"Email {email} is already used by a non-super-admin account")

        super_admin = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
        if super_admin:
            super_admin.email = email
            super_admin.hashed_password = hash_password(password)
            super_admin.full_name = full_name
            super_admin.school_id = None
            print(f"Updated super admin: {email}")
        else:
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                existing.role = UserRole.SUPER_ADMIN
                existing.hashed_password = hash_password(password)
                existing.school_id = None
                print(f"Promoted existing user to super admin: {email}")
            else:
                db.add(
                    User(
                        email=email,
                        hashed_password=hash_password(password),
                        full_name=full_name,
                        role=UserRole.SUPER_ADMIN,
                        school_id=None,
                    )
                )
                print(f"Created super admin: {email}")
        db.commit()
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure super_admin account exists")
    parser.add_argument("--email", default="superadmin@edu.com")
    parser.add_argument("--password", default="Super123!")
    parser.add_argument("--name", default="Super Admin")
    args = parser.parse_args()
    ensure_superadmin(args.email, args.password, args.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
