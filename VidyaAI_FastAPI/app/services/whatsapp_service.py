"""Outbound WhatsApp messaging (Meta Cloud API)."""

from __future__ import annotations

import logging
import re

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def format_whatsapp_number(phone: str | None, country_code: str | None = None) -> str | None:
    digits = re.sub(r"\D", "", str(phone or "").strip())
    if not digits:
        return None
    cc = re.sub(r"\D", "", (country_code or settings.whatsapp_default_country_code or "91"))
    if digits.startswith(cc) and len(digits) >= 10 + len(cc):
        return digits
    if len(digits) == 10 and cc:
        return f"{cc}{digits}"
    if digits.startswith("0") and len(digits) == 11 and cc:
        return f"{cc}{digits[1:]}"
    return digits


def send_whatsapp_text(*, to_phone: str, body: str) -> dict:
    """
    Send a plain-text WhatsApp message.
    Returns {ok, status, detail, to} — never raises to callers.
    """
    to = format_whatsapp_number(to_phone)
    if not to:
        return {"ok": False, "status": "invalid_phone", "detail": "Missing parent phone", "to": None}

    text = (body or "").strip()
    if not text:
        return {"ok": False, "status": "empty_message", "detail": "Empty message body", "to": to}

    if not settings.whatsapp_enabled:
        logger.info("WhatsApp disabled — report prepared for %s (not sent)\n%s", to, text[:500])
        return {
            "ok": False,
            "status": "disabled",
            "detail": "Set WHATSAPP_ENABLED=true and configure Meta credentials",
            "to": to,
        }

    if settings.whatsapp_provider == "log":
        logger.info("WhatsApp (log provider) → %s\n%s", to, text)
        return {
            "ok": True,
            "status": "logged",
            "detail": "Message logged (WHATSAPP_PROVIDER=log)",
            "to": to,
        }

    if settings.whatsapp_provider != "meta":
        return {
            "ok": False,
            "status": "unsupported_provider",
            "detail": f"Unsupported provider: {settings.whatsapp_provider}",
            "to": to,
        }

    if not settings.whatsapp_token or not settings.whatsapp_phone_number_id:
        logger.warning("WhatsApp enabled but token/phone_number_id missing; logging message for %s", to)
        logger.info("WhatsApp (missing config) → %s\n%s", to, text)
        return {
            "ok": False,
            "status": "not_configured",
            "detail": "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
            "to": to,
        }

    url = (
        f"https://graph.facebook.com/{settings.whatsapp_api_version}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text[:4000]},
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.whatsapp_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if response.status_code >= 400:
            detail = response.text[:500]
            logger.error("WhatsApp send failed (%s): %s", response.status_code, detail)
            return {"ok": False, "status": "api_error", "detail": detail, "to": to}
        return {"ok": True, "status": "sent", "detail": "Message accepted by WhatsApp", "to": to}
    except Exception as exc:
        logger.exception("WhatsApp send exception for %s", to)
        return {"ok": False, "status": "exception", "detail": str(exc), "to": to}
