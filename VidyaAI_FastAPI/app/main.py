import logging
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.constants.routes import API_ROOT_PREFIX
from app.exception_handlers import register_exception_handlers
from app.services.storage_service import s3_enabled
from app.database import engine, Base, SessionLocal
from app.db.init_database import bootstrap_on_startup
from app.models import Book
from app.routers import auth, schools, books, analytics, students, schedules, practice, support, leads, platform, access_roles, parents, billing, notes

app = FastAPI(title="VidyaAI API", version="1.0.0")
register_exception_handlers(app)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# Local dev: browser may use localhost or 127.0.0.1 on any port
default_dev_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
for origin in default_dev_origins:
    if origin not in origins:
        origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

vidyaai = APIRouter(prefix=API_ROOT_PREFIX)


@vidyaai.get("/ping")
def ping():
    return {"status": "pong"}


@vidyaai.get("/api/health")
def health():
    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key),
        "database": "postgres" if settings.is_postgres else "sqlite",
        "supabase": settings.supabase_configured,
        "s3_storage": settings.s3_configured,
        "smtp_configured": bool(settings.smtp_user and settings.smtp_password),
    }


vidyaai.include_router(auth.router)
vidyaai.include_router(schools.router)
vidyaai.include_router(books.router)
vidyaai.include_router(analytics.router)
vidyaai.include_router(students.router)
vidyaai.include_router(schedules.router)
vidyaai.include_router(practice.router)
vidyaai.include_router(support.router)
vidyaai.include_router(notes.router)
vidyaai.include_router(leads.router)
vidyaai.include_router(platform.router)
vidyaai.include_router(access_roles.router)
vidyaai.include_router(parents.router)
vidyaai.include_router(billing.router)
vidyaai.include_router(billing.razorpay_router)

app.include_router(vidyaai)


def _backfill_book_pages():
    from app.services.page_extraction_service import (
        extract_and_store_book_pages,
        map_pages_to_chapters,
        repair_missing_book_page_images,
    )

    db = SessionLocal()
    try:
        books = db.query(Book).filter(Book.file_type == "pdf").all()
        for book in books:
            if extract_and_store_book_pages(book.id):
                map_pages_to_chapters(book.id)
            repair_missing_book_page_images(book.id)
    finally:
        db.close()


@app.on_event("startup")
def startup():
    import time

    log = logging.getLogger(__name__)
    # Supabase DNS can flake on Windows; retry soft bootstrap before serving.
    last_exc: Exception | None = None
    for attempt in range(1, 6):
        try:
            bootstrap_on_startup()
            last_exc = None
            break
        except Exception as exc:
            last_exc = exc
            log.warning("Database bootstrap attempt %s/5 failed: %s", attempt, exc)
            time.sleep(min(2 * attempt, 8))
    if last_exc is not None:
        log.error("Database bootstrap failed after retries: %s", last_exc)

    if s3_enabled():
        log.info(
            "Upload storage: S3 bucket %s (%s)",
            settings.s3_bucket_name,
            settings.aws_region,
        )
    else:
        Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
        Path(settings.audio_dir).mkdir(parents=True, exist_ok=True)
        Path(settings.images_dir).mkdir(parents=True, exist_ok=True)

    from app.services.job_queue import reload_pending_jobs

    reloaded = reload_pending_jobs()
    if reloaded:
        log.info("Re-queued %s pending processing job(s)", reloaded)

    from app.services.image_migration_service import migrate_flat_image_paths

    migrate_flat_image_paths()
    if settings.run_startup_backfill:
        _backfill_book_pages()
