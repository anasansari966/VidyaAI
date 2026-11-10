from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base


class DemoLead(Base):
    __tablename__ = "demo_leads"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(30), nullable=False)
    organization = Column(String(255), nullable=False)
    role = Column(String(100), nullable=False)
    program = Column(String(50), nullable=False)
    student_count = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="new")
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
