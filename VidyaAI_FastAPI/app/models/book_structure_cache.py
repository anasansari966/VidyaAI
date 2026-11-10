"""Cached chapter structure from prior uploads — instant re-uploads for identical files."""

import json
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BookStructureCache(Base):
    __tablename__ = "book_structure_cache"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    file_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    total_pdf_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content_language: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chapters_json: Mapped[str] = mapped_column(Text)
    agent_subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    agent_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_teaching_style: Mapped[str | None] = mapped_column(String(100), nullable=True)
    agent_tts_voice_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    agent_expertise_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def chapters(self) -> list[dict]:
        return json.loads(self.chapters_json or "[]")

    def set_chapters(self, chapters: list[dict]) -> None:
        self.chapters_json = json.dumps(chapters, ensure_ascii=False)
