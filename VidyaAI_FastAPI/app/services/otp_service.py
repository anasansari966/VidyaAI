"""Hashed email OTP + short-lived checkout tokens."""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.email_otp import EmailOtp

logger = logging.getLogger(__name__)

OTP_PURPOSE_REGISTER = "register"
OTP_LENGTH = 6
MAX_VERIFY_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
MAX_OTPS_PER_HOUR = 5
CHECKOUT_TOKEN_MINUTES = 30


class OtpError(ValueError):
    pass


def _hash_otp(email: str, code: str) -> str:
    payload = f"{email.strip().lower()}|{code}|{settings.secret_key}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _latest_active(db: Session, email: str, purpose: str) -> EmailOtp | None:
    return (
        db.query(EmailOtp)
        .filter(
            EmailOtp.email == email,
            EmailOtp.purpose == purpose,
            EmailOtp.consumed.is_(False),
        )
        .order_by(EmailOtp.id.desc())
        .first()
    )


def create_and_store_otp(db: Session, *, email: str, purpose: str = OTP_PURPOSE_REGISTER) -> tuple[str, int]:
    email_norm = email.strip().lower()
    now = datetime.utcnow()
    hour_ago = now - timedelta(hours=1)
    recent = (
        db.query(EmailOtp)
        .filter(
            EmailOtp.email == email_norm,
            EmailOtp.purpose == purpose,
            EmailOtp.created_at >= hour_ago,
        )
        .count()
    )
    if recent >= MAX_OTPS_PER_HOUR:
        raise OtpError("Too many verification emails. Try again after an hour.")

    latest = _latest_active(db, email_norm, purpose)
    if latest and (now - latest.created_at).total_seconds() < RESEND_COOLDOWN_SECONDS:
        wait = RESEND_COOLDOWN_SECONDS - int((now - latest.created_at).total_seconds())
        raise OtpError(f"Please wait {wait}s before requesting another code.")

    if latest and not latest.consumed:
        latest.consumed = True

    ttl = max(2, int(settings.otp_ttl_minutes or 10))
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = EmailOtp(
        email=email_norm,
        purpose=purpose,
        code_hash=_hash_otp(email_norm, code),
        expires_at=now + timedelta(minutes=ttl),
        attempts=0,
        max_attempts=MAX_VERIFY_ATTEMPTS,
        consumed=False,
    )
    db.add(row)
    db.commit()
    logger.info("Issued email OTP for %s purpose=%s ttl=%sm", email_norm, purpose, ttl)
    return code, ttl * 60


def verify_otp(db: Session, *, email: str, code: str, purpose: str = OTP_PURPOSE_REGISTER) -> None:
    email_norm = email.strip().lower()
    digits = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(digits) != OTP_LENGTH:
        raise OtpError("Enter the 6-digit code from your email.")

    row = _latest_active(db, email_norm, purpose)
    if not row:
        raise OtpError("No active verification code. Request a new one.")

    now = datetime.utcnow()
    if row.expires_at < now:
        row.consumed = True
        db.commit()
        raise OtpError("This code has expired. Request a new one.")

    if row.attempts >= row.max_attempts:
        row.consumed = True
        db.commit()
        raise OtpError("Too many incorrect attempts. Request a new code.")

    row.attempts += 1
    expected = row.code_hash
    actual = _hash_otp(email_norm, digits)
    if not hmac.compare_digest(expected, actual):
        remaining = max(0, row.max_attempts - row.attempts)
        if remaining == 0:
            row.consumed = True
        db.commit()
        raise OtpError(f"Incorrect code. {remaining} attempt(s) left.")

    row.consumed = True
    db.commit()


def create_checkout_token(*, user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=CHECKOUT_TOKEN_MINUTES)
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": email.strip().lower(),
            "type": "checkout",
            "exp": expire,
        },
        settings.secret_key,
        algorithm="HS256",
    )


def parse_checkout_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError as exc:
        raise OtpError("Checkout session expired. Verify your email again.") from exc
    if payload.get("type") != "checkout":
        raise OtpError("Invalid checkout session.")
    return payload
