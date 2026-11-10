from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.constants.billing_plans import list_billing_cycles, list_india_plans
from app.database import get_db
from app.models.school import School
from app.models.user import User
from app.schemas.auth import Token, user_to_response
from app.services.billing_service import (
    RazorpayApiError,
    RazorpayAuthError,
    SignatureMismatchError,
    create_razorpay_order,
    create_razorpay_order_raw,
    get_or_create_checkout_user,
    individual_feature_access,
    normalize_in_phone,
    subscription_is_active,
    upsert_student_lead,
    verify_and_activate,
    verify_payment_only,
)
from app.services.email_service import EmailNotConfiguredError, EmailSendError, send_otp_email, smtp_configured
from app.services.otp_service import (
    OtpError,
    create_and_store_otp,
    create_checkout_token,
    parse_checkout_token,
    verify_otp,
)
from app.utils.security import get_current_user, issue_token_pair, verify_password

router = APIRouter(prefix="/api/billing", tags=["billing"])
# Standard Checkout aliases (mounted at /api/create-order and /api/verify-payment)
razorpay_router = APIRouter(prefix="/api", tags=["razorpay"])


class RegisterStudentRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    class_grade: int = Field(ge=1, le=12)
    phone: str = Field(min_length=8, max_length=30)
    parent_name: str = Field(min_length=2, max_length=200)
    parent_phone: str = Field(min_length=8, max_length=30)
    school_name: str = Field(min_length=2, max_length=255)
    city: str = Field(min_length=2, max_length=120)
    board: str = Field(min_length=2, max_length=40)


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=12)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class CheckoutStartRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"
    checkout_token: str | None = None
    email: EmailStr | None = None
    password: str | None = None


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class CreateOrderRequest(BaseModel):
    amount: int = Field(..., description="Amount in paise (minimum 100)")
    currency: str = "INR"
    receipt: str | None = None


class VerifyPaymentBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _issue_checkout_payload(user: User, *, needs_otp: bool, message: str, otp_expires_in: int | None = None):
    token = None if needs_otp else create_checkout_token(user_id=user.id, email=user.email)
    return {
        "user_id": user.id,
        "email": user.email,
        "needs_otp": needs_otp,
        "checkout_token": token,
        "otp_expires_in": otp_expires_in,
        "message": message,
    }


@router.get("/plans")
def billing_plans(cycle: str = "monthly"):
    try:
        plans = list_india_plans(cycle)
    except KeyError:
        raise HTTPException(status_code=400, detail="Invalid billing cycle")
    return {
        "country": "IN",
        "currency": "INR",
        "note": "Individual plans for India. Schools use institutional pricing (₹79/student).",
        "billing_cycle": cycle,
        "cycles": list_billing_cycles(),
        "plans": plans,
        "razorpay_configured": bool(settings.razorpay_key_id and settings.razorpay_key_secret),
        "smtp_configured": smtp_configured(),
        "dev_bypass": bool(settings.billing_dev_bypass),
        "key_id": settings.razorpay_key_id or None,
    }


@router.post("/register")
def register_student(data: RegisterStudentRequest, db: Session = Depends(get_db)):
    """Save the student as a Super Admin lead, then email a Hostinger OTP."""
    try:
        phone = normalize_in_phone(data.phone, field="Student mobile number")
        parent_phone = normalize_in_phone(data.parent_phone, field="Parent mobile number")
        user = get_or_create_checkout_user(
            db,
            email=data.email,
            password=data.password,
            full_name=data.full_name,
            class_grade=data.class_grade,
            phone=phone,
            plan_id=data.plan_id,
            billing_cycle=data.billing_cycle,
            parent_name=data.parent_name,
            parent_phone=parent_phone,
            school_name=data.school_name,
            city=data.city,
            board=data.board,
        )
        if subscription_is_active(user):
            raise HTTPException(status_code=400, detail="This email already has an active plan. Sign in instead.")

        upsert_student_lead(
            db,
            user=user,
            plan_id=data.plan_id,
            phone=phone,
            status="verified" if user.email_verified else "registered",
            billing_cycle=data.billing_cycle,
            parent_name=data.parent_name,
            parent_phone=parent_phone,
            school_name=data.school_name,
            city=data.city,
            board=data.board,
        )
        db.commit()
        db.refresh(user)

        if user.email_verified:
            return _issue_checkout_payload(
                user,
                needs_otp=False,
                message="Email already verified. Continue to payment.",
            )

        code, expires_in = create_and_store_otp(db, email=user.email)
        send_otp_email(to_email=user.email, code=code, minutes=max(2, settings.otp_ttl_minutes))
        return _issue_checkout_payload(
            user,
            needs_otp=True,
            message=f"We sent a 6-digit code to {user.email}.",
            otp_expires_in=expires_in,
        )
    except HTTPException:
        raise
    except KeyError:
        raise HTTPException(status_code=400, detail="Invalid plan or billing cycle")
    except OtpError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/register/verify-otp")
def verify_register_otp(data: VerifyOtpRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    try:
        verify_otp(db, email=email, code=data.otp)
    except OtpError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Student registration not found. Register again.")

    user.email_verified = True
    upsert_student_lead(
        db,
        user=user,
        plan_id=user.subscription_plan,
        phone=user.phone or "",
        status="verified",
    )
    db.commit()
    db.refresh(user)
    return _issue_checkout_payload(
        user,
        needs_otp=False,
        message="Email verified. Continue to payment.",
    )


@router.post("/register/resend-otp")
def resend_register_otp(data: ResendOtpRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Student registration not found. Register first.")
    if user.email_verified:
        return _issue_checkout_payload(
            user,
            needs_otp=False,
            message="Email already verified. Continue to payment.",
        )
    try:
        code, expires_in = create_and_store_otp(db, email=email)
        send_otp_email(to_email=email, code=code, minutes=max(2, settings.otp_ttl_minutes))
    except OtpError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "email": email,
        "needs_otp": True,
        "otp_expires_in": expires_in,
        "message": f"A new code was sent to {email}.",
    }


def _user_from_checkout_request(db: Session, data: CheckoutStartRequest) -> User:
    if data.checkout_token:
        try:
            payload = parse_checkout_token(data.checkout_token)
        except OtpError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        user = db.query(User).filter(User.id == int(payload["sub"])).first()
        if not user:
            raise HTTPException(status_code=401, detail="Checkout session is invalid.")
        return user

    if data.email and data.password:
        user = db.query(User).filter(User.email == data.email.strip().lower()).first()
        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        return user

    raise HTTPException(status_code=400, detail="Verify your email before payment.")


@router.post("/checkout/start")
def checkout_start(data: CheckoutStartRequest, db: Session = Depends(get_db)):
    try:
        user = _user_from_checkout_request(db, data)
        if not user.email_verified:
            raise HTTPException(status_code=403, detail="Verify your email with the OTP before payment.")
        if data.plan_id:
            user.subscription_plan = data.plan_id
            user.subscription_cycle = data.billing_cycle
            if user.subscription_status != "active" or not subscription_is_active(user):
                user.subscription_status = "pending"
        upsert_student_lead(
            db,
            user=user,
            plan_id=data.plan_id,
            phone=user.phone or "",
            status="verified",
            billing_cycle=data.billing_cycle,
        )
        db.commit()
        db.refresh(user)
        order = create_razorpay_order(
            db, user=user, plan_id=data.plan_id, billing_cycle=data.billing_cycle
        )
        return order
    except HTTPException:
        raise
    except KeyError:
        raise HTTPException(status_code=400, detail="Invalid plan or billing cycle")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RazorpayAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except RazorpayApiError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/checkout/verify", response_model=Token)
def checkout_verify(data: VerifyPaymentRequest, db: Session = Depends(get_db)):
    try:
        user = verify_and_activate(
            db,
            razorpay_order_id=data.razorpay_order_id,
            razorpay_payment_id=data.razorpay_payment_id,
            razorpay_signature=data.razorpay_signature,
        )
    except SignatureMismatchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    loaded = (
        db.query(User)
        .options(
            joinedload(User.access_role),
            joinedload(User.school).joinedload(School.default_access_role),
        )
        .filter(User.id == user.id)
        .first()
    )
    access, refresh = issue_token_pair(user.id)
    return Token(
        access_token=access,
        refresh_token=refresh,
        user=user_to_response(loaded or user, db),
    )


@router.get("/me")
def my_billing(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "subscription_plan": user.subscription_plan,
        "subscription_status": user.subscription_status,
        "subscription_expires_at": user.subscription_expires_at.isoformat()
        if user.subscription_expires_at
        else None,
        "has_access": individual_feature_access(user, db),
    }


@razorpay_router.post("/create-order")
def create_order(data: CreateOrderRequest, db: Session = Depends(get_db)):
    """Razorpay Standard Checkout — create order (amount in paise)."""
    try:
        result = create_razorpay_order_raw(
            db,
            amount_paise=data.amount,
            currency=data.currency,
            receipt=data.receipt,
        )
        return {
            "order_id": result["order_id"],
            "amount": result["amount"],
            "currency": result["currency"],
            "key_id": result["key_id"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RazorpayAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RazorpayApiError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@razorpay_router.post("/verify-payment")
def verify_payment(data: VerifyPaymentBody, db: Session = Depends(get_db)):
    """Razorpay Standard Checkout — verify HMAC-SHA256 payment signature."""
    try:
        return verify_payment_only(
            db,
            razorpay_order_id=data.razorpay_order_id,
            razorpay_payment_id=data.razorpay_payment_id,
            razorpay_signature=data.razorpay_signature,
        )
    except SignatureMismatchError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
