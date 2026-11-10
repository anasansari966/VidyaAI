import logging
from pathlib import Path

from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import SessionLocal
from app.models.book import Chapter, LecturePart, LectureVisualFrame
from app.services.storage_service import delete as delete_storage, s3_enabled
from app.utils.media_paths import (
    lecture_frame_image_path,
    migrate_image_to_structured_path,
    remove_empty_parent_dirs,
)
from app.utils.storage_scope import scope_for_book

logger = logging.getLogger(__name__)


def _is_structured_image_path(path: Path) -> bool:
    try:
        relative = path.resolve().relative_to(Path(settings.images_dir).resolve())
    except ValueError:
        return False
    parts = relative.parts
    return len(parts) >= 4 and parts[0].startswith("class-")


def migrate_flat_image_paths() -> int:
    """Move legacy flat lecture_* images into class/subject/chapter folders."""
    if s3_enabled():
        logger.info("Skipping local image migration because S3 storage is enabled")
        return 0

    db = SessionLocal()
    migrated = 0

    try:
        frames = (
            db.query(LectureVisualFrame)
            .options(
                joinedload(LectureVisualFrame.lecture_part)
                .joinedload(LecturePart.chapter)
                .joinedload(Chapter.book)
            )
            .all()
        )

        for frame in frames:
            source = Path(frame.image_path)
            if _is_structured_image_path(source):
                continue

            lecture = frame.lecture_part
            chapter = lecture.chapter
            book = chapter.book
            scope = scope_for_book(book, db)
            destination_key = lecture_frame_image_path(
                scope,
                class_grade=book.class_grade,
                subject=book.subject,
                chapter_number=chapter.chapter_number,
                chapter_title=chapter.title,
                frame_number=frame.frame_number,
            )
            destination = Path(settings.upload_dir) / destination_key.removeprefix("uploads/")

            if source.exists():
                migrate_image_to_structured_path(source, destination)
            elif destination.exists():
                pass
            else:
                logger.warning("Missing image for frame %s at %s", frame.id, source)
                continue

            frame.image_path = destination_key
            migrated += 1

        if migrated:
            db.commit()
            logger.info("Migrated %s lecture image(s) to structured folders", migrated)
    finally:
        db.close()

    images_root = Path(settings.images_dir)
    for legacy in images_root.glob("lecture_*_frame_*.png"):
        legacy.unlink(missing_ok=True)

    return migrated


def delete_image_file(image_path: str | Path) -> None:
    delete_storage(str(image_path))

    if s3_enabled():
        return

    path = Path(image_path)
    if not path.exists() or path.as_posix().startswith("uploads/"):
        return
    parent = path.parent
    path.unlink(missing_ok=True)
    remove_empty_parent_dirs(parent, stop_at=Path(settings.images_dir))
