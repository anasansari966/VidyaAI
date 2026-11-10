"""Transactional email via Hostinger SMTP (not Gmail)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


class EmailNotConfiguredError(RuntimeError):
    pass


class EmailSendError(RuntimeError):
    pass


def smtp_configured() -> bool:
    return bool(settings.smtp_user.strip() and settings.smtp_password.strip())


def _from_address() -> str:
    return (settings.smtp_from or settings.smtp_user).strip()


def send_email(*, to_email: str, subject: str, text_body: str, html_body: str) -> None:
    if not smtp_configured():
        raise EmailNotConfiguredError(
            "Hostinger SMTP is not configured. Set SMTP_USER and SMTP_PASSWORD "
            "(mailbox on smtp.hostinger.com — do not use Gmail)."
        )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name.strip() or "VidyaAI", _from_address()))
    msg["To"] = to_email.strip()
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    host = settings.smtp_host.strip() or "smtp.hostinger.com"
    port = int(settings.smtp_port or 465)
    user = settings.smtp_user.strip()
    password = settings.smtp_password
    use_ssl = bool(settings.smtp_use_ssl) or port == 465

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=25, context=context) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=25) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(user, password)
                smtp.send_message(msg)
    except EmailNotConfiguredError:
        raise
    except Exception as exc:
        logger.exception("Hostinger SMTP send failed to %s", to_email)
        raise EmailSendError(f"Could not send email via Hostinger SMTP: {exc}") from exc

    logger.info("Email sent via Hostinger SMTP to %s (%s)", to_email, subject)


def send_otp_email(*, to_email: str, code: str, minutes: int) -> None:
    subject = f"Your {settings.smtp_from_name or 'VidyaAI'} verification code"
    text_body = (
        f"Your verification code is {code}.\n\n"
        f"It expires in {minutes} minutes. Do not share this code with anyone.\n"
        "If you did not create a VidyaAI account, you can ignore this email."
    )
    html_body = f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;background:#0b1220;padding:32px;color:#e2e8f0">
      <div style="max-width:480px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px">
        <p style="margin:0 0 8px;color:#5eead4;font-size:12px;letter-spacing:.08em;text-transform:uppercase">VidyaAI</p>
        <h1 style="margin:0 0 16px;font-size:22px;color:#fff">Verify your email</h1>
        <p style="margin:0 0 20px;color:#94a3b8;line-height:1.5">
          Use this one-time code to finish student registration. It expires in {minutes} minutes.
        </p>
        <div style="font-size:32px;letter-spacing:.28em;font-weight:700;color:#5eead4;background:#042f2e;border-radius:12px;padding:16px;text-align:center">
          {code}
        </div>
        <p style="margin:20px 0 0;color:#64748b;font-size:13px">
          Never share this code. VidyaAI will never ask for it on a call or chat.
        </p>
      </div>
    </div>
    """
    send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)
