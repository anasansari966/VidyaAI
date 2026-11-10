import re

PARENT_EMAIL_DOMAIN = "parent.vidyaai"
STUDENT_EMAIL_DOMAIN = "student.vidyaai"


def normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone).strip())


def parent_login_email(phone: str, school_id: int | None = None) -> str:
    digits = normalize_phone(phone)
    if school_id is not None:
        return f"{digits}.s{school_id}@{PARENT_EMAIL_DOMAIN}"
    return f"{digits}@{PARENT_EMAIL_DOMAIN}"


def student_login_email(student_id: str, school_id: int | None = None) -> str:
    value = student_id.strip().lower()
    if "@" in value:
        return value
    safe = re.sub(r"[^a-z0-9._+-]", "", value.replace(" ", ""))
    if school_id is not None:
        return f"{safe}.s{school_id}@{STUDENT_EMAIL_DOMAIN}"
    return f"{safe}@{STUDENT_EMAIL_DOMAIN}"
