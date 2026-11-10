import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.config import settings
from app.services.storage_service import StorageUnavailableError

log = logging.getLogger(__name__)


def _db_connection_message() -> str:
    msg = "Database connection failed."
    if settings.supabase_url and not settings.supabase_db_host.strip():
        msg += (
            " On Windows, set SUPABASE_DB_HOST to the Session pooler host"
            " from Supabase Dashboard → Connect (direct db.*.supabase.co often fails DNS)."
        )
    return msg


def _safe_error_detail(exc: Exception) -> str:
    if settings.expose_error_details:
        text = str(exc).strip()
        return text or exc.__class__.__name__
    return "An unexpected server error occurred. Please try again."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StorageUnavailableError)
    async def handle_storage_unavailable(request: Request, exc: StorageUnavailableError):
        log.warning("Storage unavailable on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(OperationalError)
    async def handle_db_operational(_request: Request, exc: OperationalError):
        log.exception("Database operational error")
        return JSONResponse(
            status_code=503,
            content={"detail": _db_connection_message()},
        )

    @app.exception_handler(SQLAlchemyError)
    async def handle_sqlalchemy(request: Request, exc: SQLAlchemyError):
        log.exception("Database error on %s %s", request.method, request.url.path)
        detail = (
            _safe_error_detail(exc)
            if settings.expose_error_details
            else "A database error occurred."
        )
        return JSONResponse(status_code=500, content={"detail": detail})

    @app.exception_handler(Exception)
    async def handle_unhandled(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            raise exc
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": _safe_error_detail(exc)},
        )
