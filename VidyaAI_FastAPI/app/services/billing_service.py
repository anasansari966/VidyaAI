"""Individual India billing helpers (Razorpay Standard Checkout)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.constants.billing_plans import (
    INDIVIDUAL_ORG_TYPE,
    INDIVIDUAL_SCHOOL_NAME,
    get_cycle,
    get_plan,
    plan_permissions,
    quote_plan,
)
from app.models.access_role import AccessRole
from app.models.payment import Payment
from app.models.school import School
from app.models.student_lead import StudentLead
from app.models.user import AccountStatus, User, UserRole
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


class SignatureMismatchError(ValueError):
    """Razorpay payment signature did not match."""


class RazorpayAuthError(RuntimeError):
    """Razorpay API authentication failed."""


class RazorpayApiError(RuntimeError):
    """Razorpay API request failed."""


def verify_razorpay_signature(*, order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC-SHA256(order_id + '|' + payment_id, KEY_SECRET) == razorpay_signature."""
    if not order_id or not payment_id or not signature:
        return False
    if not settings.razorpay_key_secret:
        return False
    payload = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def ensure_individual_school(db: Session) -> School:
    school = db.query(School).filter(School.organization_type == INDIVIDUAL_ORG_TYPE).first()
    if school:
        return school

    full_access = db.query(AccessRole).filter(AccessRole.name == "Full Access").first()
    school = School(
        name=INDIVIDUAL_SCHOOL_NAME,
        organization_type=INDIVIDUAL_ORG_TYPE,
        default_access_role_id=full_access.id if full_access else None,
        address="Online · India",
    )
    db.add(school)
    db.flush()
    return school


def is_individual_student(user: User, db: Session | None = None) -> bool:
    if user.role != UserRole.STUDENT:
        return False
    if (user.subscription_status or "") in ("pending", "active", "expired"):
        return True
    school = user.school
    if school is None and db is not None and user.school_id:
        school = db.query(School).filter(School.id == user.school_id).first()
    return bool(school and school.organization_type == INDIVIDUAL_ORG_TYPE)


def subscription_is_active(user: User) -> bool:
    status = (user.subscription_status or "").lower()
    if status == "school_managed":
        return True
    if status != "active":
        return False
    if user.subscription_expires_at and user.subscription_expires_at < datetime.utcnow():
        return False
    return True


def individual_feature_access(user: User, db: Session | None = None) -> bool:
    if user.role != UserRole.STUDENT:
        return True
    if not is_individual_student(user, db):
        return True
    return subscription_is_active(user)


def normalize_in_phone(raw: str | None, *, field: str = "Mobile number") -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise ValueError(f"{field} must be a valid 10-digit Indian mobile number")
    return digits


def activate_subscription(
    user: User,
    plan_id: str,
    *,
    days: int = 30,
    billing_cycle: str | None = None,
) -> None:
    plan = get_plan(plan_id)
    user.subscription_plan = plan["id"]
    user.subscription_status = "active"
    user.subscription_expires_at = datetime.utcnow() + timedelta(days=days)
    if billing_cycle:
        user.subscription_cycle = billing_cycle
    user.is_active = True
    user.account_status = AccountStatus.ACTIVE.value


def upsert_student_lead(
    db: Session,
    *,
    user: User,
    plan_id: str | None,
    phone: str,
    status: str | None = None,
    billing_cycle: str | None = None,
    parent_name: str | None = None,
    parent_phone: str | None = None,
    school_name: str | None = None,
    city: str | None = None,
    board: str | None = None,
) -> StudentLead:
    email_norm = user.email.strip().lower()
    lead = db.query(StudentLead).filter(StudentLead.email == email_norm).first()
    now = datetime.utcnow()
    extras = {
        "parent_name": parent_name or user.parent_name,
        "parent_phone": parent_phone or user.parent_phone,
        "school_name": school_name or user.enrolled_school_name,
        "city": city or user.city,
        "board": board or user.board,
        "billing_cycle": billing_cycle or user.subscription_cycle,
    }
    if lead:
        lead.full_name = user.full_name
        lead.phone = phone or lead.phone
        lead.class_grade = user.class_grade
        if plan_id:
            lead.plan_id = plan_id
        for key, value in extras.items():
            if value:
                setattr(lead, key, value)
        lead.user_id = user.id
        lead.email_verified = bool(user.email_verified)
        if status:
            lead.status = status
        lead.updated_at = now
        return lead

    lead = StudentLead(
        full_name=user.full_name,
        email=email_norm,
        phone=phone or user.phone or "",
        class_grade=user.class_grade,
        plan_id=plan_id,
        status=status or "registered",
        email_verified=bool(user.email_verified),
        user_id=user.id,
        created_at=now,
        updated_at=now,
        **{k: v for k, v in extras.items() if v},
    )
    db.add(lead)
    db.flush()
    return lead


def mark_student_lead_paid(db: Session, user: User) -> None:
    lead = (
        db.query(StudentLead)
        .filter(StudentLead.email == user.email.strip().lower())
        .first()
    )
    if not lead:
        return
    lead.status = "paid"
    lead.email_verified = True
    lead.user_id = user.id
    lead.updated_at = datetime.utcnow()


def get_or_create_checkout_user(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str,
    class_grade: int | None,
    phone: str | None,
    plan_id: str,
    billing_cycle: str | None = None,
    parent_name: str | None = None,
    parent_phone: str | None = None,
    school_name: str | None = None,
    city: str | None = None,
    board: str | None = None,
) -> User:
    email_norm = email.strip().lower()
    school = ensure_individual_school(db)
    cycle = get_cycle(billing_cycle)
    existing = db.query(User).filter(User.email == email_norm).first()
    if existing:
        if existing.role != UserRole.STUDENT:
            raise ValueError("This email is already registered with another role")
        if not is_individual_student(existing, db) and existing.school_id and existing.school_id != school.id:
            raise ValueError("This email belongs to a school account. Ask your school admin for access.")
        existing.full_name = full_name.strip() or existing.full_name
        if password.strip():
            existing.hashed_password = hash_password(password.strip())
        if class_grade is not None:
            existing.class_grade = class_grade
        if phone:
            existing.phone = phone
        if parent_name:
            existing.parent_name = parent_name.strip()
        if parent_phone:
            existing.parent_phone = parent_phone
        if school_name:
            existing.enrolled_school_name = school_name.strip()
        if city:
            existing.city = city.strip()
        if board:
            existing.board = board.strip()
        existing.school_id = school.id
        existing.program = "school"
        if existing.subscription_status != "active" or not subscription_is_active(existing):
            existing.subscription_plan = plan_id
            existing.subscription_cycle = cycle["id"]
            existing.subscription_status = "pending"
        return existing

    user = User(
        email=email_norm,
        hashed_password=hash_password(password.strip()),
        full_name=full_name.strip(),
        role=UserRole.STUDENT,
        school_id=school.id,
        class_grade=class_grade,
        program="school",
        phone=phone,
        parent_name=parent_name.strip() if parent_name else None,
        parent_phone=parent_phone,
        enrolled_school_name=school_name.strip() if school_name else None,
        city=city.strip() if city else None,
        board=board.strip() if board else None,
        access_role_id=school.default_access_role_id,
        subscription_plan=plan_id,
        subscription_cycle=cycle["id"],
        subscription_status="pending",
        account_status=AccountStatus.ACTIVE.value,
        is_active=True,
        email_verified=False,
    )
    db.add(user)
    db.flush()
    return user


def _razorpay_client():
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise RuntimeError(
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
        )
    import razorpay

    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def create_razorpay_order_raw(
    db: Session,
    *,
    amount_paise: int,
    currency: str = "INR",
    receipt: str | None = None,
    user_id: int | None = None,
    plan_id: str | None = None,
    customer_email: str | None = None,
    customer_name: str | None = None,
    billing_cycle: str | None = None,
    days: int | None = None,
) -> dict:
    """Create a Razorpay order. Amount must be >= 100 paise."""
    if amount_paise < 100:
        raise ValueError("Amount must be at least 100 paise (₹1)")

    currency = (currency or "INR").upper()
    payment = Payment(
        user_id=user_id,
        plan_id=plan_id or "custom",
        amount_paise=amount_paise,
        currency=currency,
        status="created",
        customer_email=customer_email,
        customer_name=customer_name,
        notes_json=json.dumps(
            {
                "plan": plan_id,
                "user_id": user_id,
                "billing_cycle": billing_cycle,
                "days": days,
            }
        ),
    )
    db.add(payment)
    db.flush()

    if settings.billing_dev_bypass:
        order_id = f"order_dev_{payment.id}"
        payment.razorpay_order_id = order_id
        db.commit()
        db.refresh(payment)
        return {
            "order_id": order_id,
            "amount": amount_paise,
            "currency": currency,
            "key_id": settings.razorpay_key_id or "rzp_test_dev",
            "payment_id": payment.id,
            "dev_bypass": True,
        }

    try:
        client = _razorpay_client()
        order = client.order.create(
            {
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt or f"vidyaai_{payment.id}",
                "notes": {
                    "plan_id": plan_id or "",
                    "user_id": str(user_id or ""),
                    "payment_pk": str(payment.id),
                    "billing_cycle": billing_cycle or "",
                },
            }
        )
    except Exception as exc:
        db.rollback()
        message = str(exc).lower()
        if "auth" in message or "authentication" in message or "401" in message:
            raise RazorpayAuthError("Razorpay authentication failed. Check API keys.") from exc
        raise RazorpayApiError(f"Razorpay order creation failed: {exc}") from exc

    payment.razorpay_order_id = order["id"]
    db.commit()
    db.refresh(payment)
    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": currency,
        "key_id": settings.razorpay_key_id,
        "payment_id": payment.id,
        "dev_bypass": False,
    }


def create_razorpay_order(
    db: Session,
    *,
    user: User,
    plan_id: str,
    billing_cycle: str | None = None,
) -> dict:
    quote = quote_plan(plan_id, billing_cycle or user.subscription_cycle)
    amount_paise = int(quote["price_inr"]) * 100
    raw = create_razorpay_order_raw(
        db,
        amount_paise=amount_paise,
        currency="INR",
        receipt=f"vidyaai_{plan_id}_{quote['billing_cycle']}_{user.id}",
        user_id=user.id,
        plan_id=plan_id,
        customer_email=user.email,
        customer_name=user.full_name,
        billing_cycle=quote["billing_cycle"],
        days=quote["days"],
    )
    return {
        **raw,
        "plan": quote,
        "billing_cycle": quote["billing_cycle"],
        "user_id": user.id,
        "prefill": {"name": user.full_name, "email": user.email, "contact": user.phone or ""},
    }


def _cycle_from_payment(payment: Payment) -> tuple[int, str | None]:
    days = 30
    cycle = None
    if payment.notes_json:
        try:
            notes = json.loads(payment.notes_json)
            if notes.get("days"):
                days = int(notes["days"])
            cycle = notes.get("billing_cycle")
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return days, cycle


def verify_and_activate(
    db: Session,
    *,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> User:
    if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
        raise ValueError("Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature")

    payment = (
        db.query(Payment)
        .filter(Payment.razorpay_order_id == razorpay_order_id)
        .order_by(Payment.id.desc())
        .first()
    )
    if not payment:
        raise ValueError("Payment order not found")

    if payment.status == "paid" and payment.user_id:
        user = db.query(User).filter(User.id == payment.user_id).first()
        if not user:
            raise ValueError("User not found")
        return user

    is_dev = razorpay_order_id.startswith("order_dev_") and settings.billing_dev_bypass
    if not is_dev:
        if not verify_razorpay_signature(
            order_id=razorpay_order_id,
            payment_id=razorpay_payment_id,
            signature=razorpay_signature,
        ):
            raise SignatureMismatchError("Payment signature verification failed")

    user = db.query(User).filter(User.id == payment.user_id).first()
    if not user:
        raise ValueError("User not found for payment")

    payment.status = "paid"
    payment.razorpay_payment_id = razorpay_payment_id
    payment.razorpay_signature = razorpay_signature
    payment.paid_at = datetime.utcnow()
    days, cycle = _cycle_from_payment(payment)
    if payment.plan_id and payment.plan_id != "custom":
        try:
            activate_subscription(user, payment.plan_id, days=days, billing_cycle=cycle)
        except KeyError:
            user.subscription_status = "active"
    else:
        user.subscription_status = "active"
    user.email_verified = True
    mark_student_lead_paid(db, user)
    db.commit()
    db.refresh(user)
    return user


def verify_payment_only(
    db: Session,
    *,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> dict:
    if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
        raise ValueError("Missing required payment verification fields")

    is_dev = razorpay_order_id.startswith("order_dev_") and settings.billing_dev_bypass
    if not is_dev and not verify_razorpay_signature(
        order_id=razorpay_order_id,
        payment_id=razorpay_payment_id,
        signature=razorpay_signature,
    ):
        raise SignatureMismatchError("Payment signature verification failed")

    payment = (
        db.query(Payment)
        .filter(Payment.razorpay_order_id == razorpay_order_id)
        .order_by(Payment.id.desc())
        .first()
    )
    if payment and payment.status != "paid":
        payment.status = "paid"
        payment.razorpay_payment_id = razorpay_payment_id
        payment.razorpay_signature = razorpay_signature
        payment.paid_at = datetime.utcnow()
        if payment.user_id and payment.plan_id and payment.plan_id != "custom":
            user = db.query(User).filter(User.id == payment.user_id).first()
            if user:
                try:
                    days, cycle = _cycle_from_payment(payment)
                    activate_subscription(user, payment.plan_id, days=days, billing_cycle=cycle)
                except KeyError:
                    pass
                user.email_verified = True
                mark_student_lead_paid(db, user)
        db.commit()

    return {
        "success": True,
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
    }


def permissions_for_user_plan(user: User) -> list[str] | None:
    if not is_individual_student(user, None):
        return None
    if not subscription_is_active(user):
        return []
    perms = plan_permissions(user.subscription_plan)
    return perms or None
