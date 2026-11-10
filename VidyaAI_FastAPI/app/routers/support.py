import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from openai import BadRequestError, OpenAI
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.constants.routes import api_path
from app.database import get_db
from app.models.user import User
from app.services.storage_service import exists as storage_exists, storage_file_response, write_bytes
from app.services.support_service import (
    chat_with_support,
    delete_support_history,
    list_support_history,
    list_support_sessions,
    resolve_support_context,
    save_support_message,
    transcribe_support_audio,
)
from app.services.tts_service import synthesize_speech_bytes
from app.utils.media_paths import support_audio_key
from app.utils.storage_scope import scope_for_user
from app.utils.security import get_current_user_bearer_or_query
from app.utils.service_access import require_student_service

router = APIRouter(prefix="/api/support", tags=["support"])
logger = logging.getLogger(__name__)


class SupportTextRequest(BaseModel):
    message: str
    subject: str
    chapter_id: int
    book_page_number: int | None = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Message is required")
        return text

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Subject is required")
        return text


class SupportResponse(BaseModel):
    reply: str
    transcript: str | None = None
    audio_url: str | None = None


class SupportHistoryMessage(BaseModel):
    id: int
    role: str
    content: str
    audio_url: str | None = None
    created_at: str | None = None


class SupportHistoryResponse(BaseModel):
    messages: list[SupportHistoryMessage]


class SupportSessionItem(BaseModel):
    chapter_id: int
    subject: str
    chapter_title: str
    chapter_number: int | None = None
    last_message: str
    last_role: str
    updated_at: str | None = None


class SupportSessionsResponse(BaseModel):
    sessions: list[SupportSessionItem]


def _maybe_tts_url(db: Session, *, user: User, chapter_id: int, reply: str) -> str | None:
    if not (settings.aws_access_key_id and settings.aws_secret_access_key):
        return None
    try:
        speech_bytes = synthesize_speech_bytes(reply, max_chars=1500, persona="warm")
        scope = scope_for_user(user, db)
        audio_key = support_audio_key(scope, user.id, chapter_id)
        stored_ref = write_bytes(audio_key, speech_bytes, content_type="audio/mpeg")
        return api_path(f"/api/support/audio?ref={quote(stored_ref, safe='')}")
    except Exception as exc:
        logger.warning("Support TTS failed: %s", exc)
        return None


def _support_reply(
    db: Session,
    *,
    user: User,
    message: str,
    subject: str,
    chapter_id: int,
    book_page_number: int | None = None,
) -> str:
    context, _chapter, error = resolve_support_context(
        db,
        user=user,
        subject=subject,
        chapter_id=chapter_id,
        book_page_number=book_page_number,
    )
    if error or not context:
        raise HTTPException(status_code=400, detail=error or "Support is not available for this selection.")
    return chat_with_support(message=message, chapter_context=context)


@router.get("/history", response_model=SupportHistoryResponse)
def support_history(
    subject: str = Query(..., min_length=1),
    chapter_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("support")),
):
    rows = list_support_history(
        db,
        student_id=user.id,
        chapter_id=chapter_id,
        subject=subject,
    )
    return SupportHistoryResponse(
        messages=[
            SupportHistoryMessage(
                id=row.id,
                role=row.role,
                content=row.content,
                audio_url=row.audio_url,
                created_at=row.created_at.isoformat() if row.created_at else None,
            )
            for row in rows
        ]
    )


@router.get("/sessions", response_model=SupportSessionsResponse)
def support_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("support")),
):
    return SupportSessionsResponse(sessions=list_support_sessions(db, student_id=user.id))


@router.delete("/history")
def support_delete_history(
    subject: str = Query(..., min_length=1),
    chapter_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("support")),
):
    deleted = delete_support_history(
        db,
        student_id=user.id,
        chapter_id=chapter_id,
        subject=subject,
    )
    return {"ok": True, "deleted": deleted}


@router.post("/chat", response_model=SupportResponse)
def support_chat(
    data: SupportTextRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("support")),
):
    save_support_message(
        db,
        student_id=user.id,
        chapter_id=data.chapter_id,
        subject=data.subject,
        role="user",
        content=data.message,
    )
    reply = _support_reply(
        db,
        user=user,
        message=data.message,
        subject=data.subject,
        chapter_id=data.chapter_id,
        book_page_number=data.book_page_number,
    )
    audio_url = _maybe_tts_url(db, user=user, chapter_id=data.chapter_id, reply=reply)
    save_support_message(
        db,
        student_id=user.id,
        chapter_id=data.chapter_id,
        subject=data.subject,
        role="assistant",
        content=reply,
        audio_url=audio_url,
    )
    return SupportResponse(reply=reply, audio_url=audio_url)


@router.post("/voice", response_model=SupportResponse)
async def support_voice(
    subject: str = Form(...),
    chapter_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_student_service("support")),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Voice support requires OpenAI API key")

    subject_clean = subject.strip()
    if not subject_clean:
        raise HTTPException(status_code=400, detail="Select a subject before recording.")

    context, _chapter, error = resolve_support_context(
        db,
        user=user,
        subject=subject_clean,
        chapter_id=chapter_id,
    )
    if error or not context:
        raise HTTPException(status_code=400, detail=error or "Support is not available for this selection.")

    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio upload.")

    content_type = audio.content_type or "audio/webm"
    filename = audio.filename or "voice.webm"
    if "." not in filename:
        if "mp4" in content_type or "aac" in content_type:
            filename = "voice.m4a"
        else:
            filename = "voice.webm"

    client = OpenAI(api_key=settings.openai_api_key)
    try:
        transcript = transcribe_support_audio(
            client,
            raw,
            filename=filename,
            content_type=content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BadRequestError as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read the audio. Hold the microphone longer and try again.",
        ) from exc

    save_support_message(
        db,
        student_id=user.id,
        chapter_id=chapter_id,
        subject=subject_clean,
        role="user",
        content=transcript,
    )
    reply = chat_with_support(message=transcript, chapter_context=context)
    audio_url = _maybe_tts_url(db, user=user, chapter_id=chapter_id, reply=reply)
    save_support_message(
        db,
        student_id=user.id,
        chapter_id=chapter_id,
        subject=subject_clean,
        role="assistant",
        content=reply,
        audio_url=audio_url,
    )

    return SupportResponse(reply=reply, transcript=transcript, audio_url=audio_url)


@router.get("/audio")
def support_audio(
    ref: str = Query(..., min_length=1),
    _user: User = Depends(get_current_user_bearer_or_query),
):
    if ".." in ref or not ref.startswith("uploads/"):
        raise HTTPException(status_code=404, detail="Audio not found")
    if not storage_exists(ref):
        raise HTTPException(status_code=404, detail="Audio not found")
    try:
        return storage_file_response(ref, media_type="audio/mpeg")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio not found") from None
