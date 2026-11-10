"""Cascade-delete a school and all tenant-scoped data."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from app.models.book import (
    Book,
    Chapter,
    LecturePart,
    LectureSchedule,
    StudentProgress,
)
from app.models.practice import PracticePaper, PracticeTemplate
from app.models.school import School
from app.models.user import User, UserRole
from app.services.image_migration_service import delete_image_file
from app.services.storage_service import delete as delete_storage


def delete_school_cascade(db: Session, school: School) -> dict[str, int]:
    school_id = school.id
    student_ids = [
        row[0]
        for row in db.query(User.id)
        .filter(User.school_id == school_id, User.role == UserRole.STUDENT)
        .all()
    ]

    progress_removed = 0
    if student_ids:
        progress_removed = (
            db.query(StudentProgress)
            .filter(StudentProgress.student_id.in_(student_ids))
            .delete(synchronize_session=False)
        )
        db.query(PracticePaper).filter(PracticePaper.student_id.in_(student_ids)).delete(
            synchronize_session=False
        )

    templates_removed = (
        db.query(PracticeTemplate)
        .filter(PracticeTemplate.school_id == school_id)
        .delete(synchronize_session=False)
    )

    books = (
        db.query(Book)
        .options(
            joinedload(Book.chapters)
            .joinedload(Chapter.lecture_parts)
            .joinedload(LecturePart.visual_frames)
        )
        .filter(Book.school_id == school_id)
        .all()
    )
    books_removed = len(books)

    lecture_part_ids: list[int] = []
    for book in books:
        for chapter in book.chapters:
            lecture_part_ids.extend(lp.id for lp in chapter.lecture_parts)

    if lecture_part_ids:
        db.query(StudentProgress).filter(
            StudentProgress.lecture_part_id.in_(lecture_part_ids)
        ).delete(synchronize_session=False)

    for book in books:
        for chapter in book.chapters:
            for lecture in chapter.lecture_parts:
                if lecture.audio_path:
                    delete_storage(lecture.audio_path)
                for frame in lecture.visual_frames:
                    if frame.image_path:
                        delete_image_file(frame.image_path)
        if book.file_path:
            delete_storage(book.file_path)
        db.delete(book)

    schedules_removed = (
        db.query(LectureSchedule)
        .filter(LectureSchedule.school_id == school_id)
        .delete(synchronize_session=False)
    )

    users_removed = (
        db.query(User).filter(User.school_id == school_id).delete(synchronize_session=False)
    )

    db.delete(school)
    db.commit()

    return {
        "school_id": school_id,
        "users_removed": users_removed,
        "books_removed": books_removed,
        "templates_removed": templates_removed,
        "schedules_removed": schedules_removed,
        "progress_removed": progress_removed,
    }
