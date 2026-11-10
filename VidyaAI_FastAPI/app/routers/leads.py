from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.demo_lead import DemoLead
from app.models.student_lead import StudentLead
from app.models.user import User
from app.schemas.demo_lead import DemoLeadCreate, DemoLeadResponse, DemoLeadUpdate
from app.schemas.student_lead import StudentLeadResponse, StudentLeadUpdate
from app.utils.security import require_super_admin

router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.post("/demo", response_model=DemoLeadResponse, status_code=201)
def submit_demo_lead(data: DemoLeadCreate, db: Session = Depends(get_db)):
    lead = DemoLead(
        full_name=data.full_name.strip(),
        email=data.email.strip().lower(),
        phone=data.phone.strip(),
        organization=data.organization.strip(),
        role=data.role.strip(),
        program=data.program.strip(),
        student_count=data.student_count.strip() if data.student_count else None,
        message=data.message.strip() if data.message else None,
        status="new",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/demo", response_model=list[DemoLeadResponse])
def list_demo_leads(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    leads = db.query(DemoLead).order_by(DemoLead.created_at.desc()).all()
    return leads


@router.patch("/demo/{lead_id}", response_model=DemoLeadResponse)
def update_demo_lead(
    lead_id: int,
    data: DemoLeadUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    lead = db.query(DemoLead).filter(DemoLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if data.status is not None:
        lead.status = data.status
    if data.admin_notes is not None:
        lead.admin_notes = data.admin_notes.strip() or None
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/students", response_model=list[StudentLeadResponse])
def list_student_leads(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return db.query(StudentLead).order_by(StudentLead.created_at.desc()).all()


@router.patch("/students/{lead_id}", response_model=StudentLeadResponse)
def update_student_lead(
    lead_id: int,
    data: StudentLeadUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    from datetime import datetime

    lead = db.query(StudentLead).filter(StudentLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Student lead not found")
    if data.status is not None:
        lead.status = data.status
    if data.admin_notes is not None:
        lead.admin_notes = data.admin_notes.strip() or None
    lead.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lead)
    return lead
