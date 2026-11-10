import shutil
from pathlib import Path

from app.config import settings
from app.utils.slugify import slugify
from app.utils.storage_scope import StorageScope


def book_original_key(scope: StorageScope, filename: str) -> str:
    return scope.key("books", filename)


def lecture_audio_key(scope: StorageScope, lecture_id: int) -> str:
    return scope.key("audio", f"lecture_{lecture_id}.mp3")


def support_audio_key(scope: StorageScope, user_id: int, chapter_id: int) -> str:
    return scope.key("audio", "support", f"student_{user_id}_{chapter_id}.mp3")


def lecture_frame_image_key(
    scope: StorageScope,
    *,
    class_grade: int,
    subject: str,
    chapter_number: int,
    chapter_title: str,
    frame_number: int,
) -> str:
    subject_dir = slugify(subject)
    chapter_dir = f"chapter-{chapter_number}-{slugify(chapter_title)}"
    return scope.key(
        "images",
        f"class-{class_grade}",
        subject_dir,
        chapter_dir,
        f"frame_{frame_number}.png",
    )


def book_page_image_key(
    scope: StorageScope,
    *,
    class_grade: int,
    subject: str,
    book_id: int,
    page_number: int,
) -> str:
    return scope.key(
        "pages",
        f"class-{class_grade}",
        slugify(subject),
        f"book-{book_id}",
        f"page_{page_number:03d}.png",
    )


# Legacy helpers kept for local migration utilities
def lecture_images_dir(
    *,
    class_grade: int,
    subject: str,
    chapter_number: int,
    chapter_title: str,
) -> Path:
    subject_dir = slugify(subject)
    chapter_dir = f"chapter-{chapter_number}-{slugify(chapter_title)}"
    return Path(settings.images_dir) / f"class-{class_grade}" / subject_dir / chapter_dir


def lecture_frame_image_path(
    scope: StorageScope,
    *,
    class_grade: int,
    subject: str,
    chapter_number: int,
    chapter_title: str,
    frame_number: int,
) -> str:
    return lecture_frame_image_key(
        scope,
        class_grade=class_grade,
        subject=subject,
        chapter_number=chapter_number,
        chapter_title=chapter_title,
        frame_number=frame_number,
    )


def book_page_image_path(
    scope: StorageScope,
    *,
    class_grade: int,
    subject: str,
    book_id: int,
    page_number: int,
) -> str:
    return book_page_image_key(
        scope,
        class_grade=class_grade,
        subject=subject,
        book_id=book_id,
        page_number=page_number,
    )


def remove_empty_parent_dirs(path: Path, *, stop_at: Path) -> None:
    current = path if path.is_dir() else path.parent
    stop_at = stop_at.resolve()

    while current.resolve() != stop_at and current.exists() and current.is_dir():
        if any(current.iterdir()):
            break
        current.rmdir()
        current = current.parent


def migrate_image_to_structured_path(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() == destination.resolve():
        return destination
    if destination.exists():
        destination.unlink()
    shutil.move(str(source), str(destination))
    return destination
