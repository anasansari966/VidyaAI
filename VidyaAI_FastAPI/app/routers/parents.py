from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import UserResponse, user_to_response
from app.services.parent_report_service import build_student_report_pdf, list_student_report_cards
from app.services.parent_service import list_parent_students, parent_can_view_student
from app.services.student_performance_service import build_student_performance
from app.utils.security import require_roles

router = APIRouter(prefix="/api/parent", tags=["parent"])


@router.get("/children", response_model=list[UserResponse])
def list_children(
    db: Session = Depends(get_db),
    parent: User = Depends(require_roles(UserRole.PARENT)),
):
    students = list_parent_students(db, parent)
    return [user_to_response(student, db) for student in students]


@router.get("/children/{student_id}/performance")
def child_performance(
    student_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_roles(UserRole.PARENT)),
):
    student = parent_can_view_student(db, parent, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return build_student_performance(db, student)


@router.get("/children/{student_id}/reports")
def child_reports(
    student_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_roles(UserRole.PARENT)),
):
    student = parent_can_view_student(db, parent, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return list_student_report_cards(db, student)


@router.get("/children/{student_id}/reports/{paper_id}/pdf")
def child_report_pdf(
    student_id: int,
    paper_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_roles(UserRole.PARENT)),
):
    student = parent_can_view_student(db, parent, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    try:
        pdf_bytes, filename = build_student_report_pdf(db, student, paper_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=60",
        },
    )
