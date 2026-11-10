"""Strict learning-resource isolation by program domain (school / jee / neet / govt)."""

from sqlalchemy.orm import Query

from app.constants.programs import is_school_program, normalize_program
from app.models.book import Book
from app.models.user import User, UserRole

DEFAULT_EXAM_TRACK: dict[str, str] = {
    "jee": "mains",
    "neet": "medical",
    "govt": "upsc",
}


def effective_exam_track(program: str | None, exam_track: str | None) -> str:
    program = normalize_program(program)
    if is_school_program(program):
        return ""
    track = (exam_track or "").strip()
    return track or DEFAULT_EXAM_TRACK.get(program, "")


def book_program(book: Book) -> str:
    return normalize_program(getattr(book, "program", None) or "school")


def book_exam_track(book: Book) -> str:
    return effective_exam_track(book.program, book.exam_track)


def user_exam_track(user: User) -> str:
    return effective_exam_track(user.program, user.exam_track)


def book_matches_program(
    book: Book,
    *,
    program: str | None,
    class_grade: int | None = None,
    exam_track: str | None = None,
) -> bool:
    program = normalize_program(program)
    if book_program(book) != program:
        return False
    if is_school_program(program):
        if class_grade is None:
            return True
        return (book.class_grade or 0) == class_grade
    return book_exam_track(book) == effective_exam_track(program, exam_track)


def book_visible_to_user(book: Book, user: User) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if book.school_id != user.school_id:
        return False
    if user.role == UserRole.ADMIN:
        return book_matches_program(
            book,
            program=user.program,
            class_grade=None if is_school_program(user.program) else None,
            exam_track=user.exam_track,
        )
    if user.role != UserRole.STUDENT:
        return False
    if is_school_program(user.program):
        return book_matches_program(
            book,
            program="school",
            class_grade=user.class_grade,
        )
    return book_matches_program(
        book,
        program=user.program,
        exam_track=user.exam_track,
    )


def student_visible_to_admin(student: User, admin: User) -> bool:
    if admin.role != UserRole.ADMIN or student.role != UserRole.STUDENT:
        return False
    if student.school_id != admin.school_id:
        return False
    admin_program = normalize_program(admin.program)
    student_program = normalize_program(student.program)
    if admin_program != student_program:
        return False
    if is_school_program(admin_program):
        return True
    return effective_exam_track(student.program, student.exam_track) == effective_exam_track(
        admin.program, admin.exam_track
    )


def apply_admin_student_scope(query: Query, admin: User) -> Query:
    if admin.role != UserRole.ADMIN or not admin.school_id:
        return query
    query = query.filter(User.school_id == admin.school_id, User.role == UserRole.STUDENT)
    program = normalize_program(admin.program)
    query = query.filter(User.program == program)
    if not is_school_program(program):
        track = effective_exam_track(program, admin.exam_track)
        query = query.filter(User.exam_track == track)
    return query


def apply_book_program_filters(
    query: Query,
    *,
    program: str | None,
    class_grade: int | None = None,
    exam_track: str | None = None,
) -> Query:
    program = normalize_program(program)
    query = query.filter(Book.program == program)
    if is_school_program(program):
        if class_grade is not None and class_grade > 0:
            query = query.filter(Book.class_grade == class_grade)
    else:
        track = effective_exam_track(program, exam_track)
        query = query.filter(Book.exam_track == track)
    return query


def apply_student_book_scope(query: Query, user: User) -> Query:
    if user.role != UserRole.STUDENT or not user.school_id:
        return query
    query = query.filter(Book.school_id == user.school_id)
    if is_school_program(user.program):
        if user.class_grade:
            return apply_book_program_filters(
                query, program="school", class_grade=user.class_grade
            )
        return query.filter(Book.program == "school")
    return apply_book_program_filters(
        query, program=user.program, exam_track=user.exam_track
    )


def domain_subjects_for_student(db, user: User) -> set[str]:
    if not user.school_id or user.role != UserRole.STUDENT:
        return set()
    rows = (
        apply_student_book_scope(db.query(Book.subject).filter(Book.school_id == user.school_id), user)
        .distinct()
        .all()
    )
    return {row[0] for row in rows if row[0]}


def lecture_progress_query(db, user: User, *, completed: bool | None = None):
    from app.models.book import Chapter, LecturePart, StudentProgress

    q = (
        db.query(StudentProgress)
        .join(LecturePart, StudentProgress.lecture_part_id == LecturePart.id)
        .join(Chapter, LecturePart.chapter_id == Chapter.id)
        .join(Book, Chapter.book_id == Book.id)
        .filter(StudentProgress.student_id == user.id)
    )
    if completed is not None:
        q = q.filter(StudentProgress.completed == completed)
    return apply_student_book_scope(q, user)
