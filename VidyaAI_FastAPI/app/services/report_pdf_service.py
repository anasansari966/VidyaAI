"""Generate printable PDF report cards for parents (with charts)."""

from __future__ import annotations

import io
import textwrap
from datetime import datetime
from typing import Any

import fitz
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Wedge  # noqa: E402


def _safe(text: Any) -> str:
    return str(text or "").replace("\r", "").strip()


def _fig_to_png(fig: plt.Figure) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=140, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


def _score_gauge_png(percent: float, score: int, total: int, *, title: str = "This test score") -> bytes:
    pct = max(0.0, min(100.0, float(percent)))
    fig, ax = plt.subplots(figsize=(4.2, 2.4), facecolor="#f7fbfb")
    ax.set_xlim(-1.35, 1.35)
    ax.set_ylim(-0.35, 1.2)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=11, color="#0d4f54", pad=4)

    # Background arc (semicircle)
    bg = Wedge((0, 0), 1.0, 0, 180, width=0.28, facecolor="#d9e8e7", edgecolor="none")
    ax.add_patch(bg)
    # Score arc
    end = 180 * (pct / 100.0)
    color = "#0f766e" if pct >= 75 else "#0284c7" if pct >= 50 else "#e11d48"
    fg = Wedge((0, 0), 1.0, 180 - end, 180, width=0.28, facecolor=color, edgecolor="none")
    ax.add_patch(fg)
    ax.text(0, 0.18, f"{pct:.0f}%", ha="center", va="center", fontsize=22, fontweight="bold", color="#0f172a")
    ax.text(0, -0.12, f"{score}/{total} marks", ha="center", va="center", fontsize=9, color="#475569")
    return _fig_to_png(fig)


def _trend_chart_png(history: list[dict[str, Any]]) -> bytes | None:
    if len(history) < 1:
        return None
    labels = []
    values = []
    for row in history[-8:]:
        label = str(row.get("label") or "Test")
        labels.append(label[:12])
        values.append(float(row.get("percent") or 0))

    fig, ax = plt.subplots(figsize=(5.4, 2.5), facecolor="#f7fbfb")
    ax.set_facecolor("#f7fbfb")
    x = list(range(len(values)))
    ax.plot(x, values, color="#0f766e", linewidth=2.2, marker="o", markersize=5)
    ax.fill_between(x, values, color="#14b8a6", alpha=0.18)
    ax.set_ylim(0, 105)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("%", fontsize=9)
    ax.set_title("Recent performance trend", fontsize=11, color="#0d4f54", pad=6)
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    return _fig_to_png(fig)


def _subject_bars_png(subjects: list[dict[str, Any]]) -> bytes | None:
    if not subjects:
        return None
    rows = subjects[:6]
    labels = [str(r.get("subject") or "Subject")[:14] for r in rows]
    values = [float(r.get("avg_percent") or 0) for r in rows]

    fig, ax = plt.subplots(figsize=(5.4, 2.6), facecolor="#f7fbfb")
    ax.set_facecolor("#f7fbfb")
    y_pos = list(range(len(labels)))
    bars = ax.barh(y_pos, values, color="#0d9488", height=0.55)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=8)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Average %", fontsize=9)
    ax.set_title("Subject-wise averages", fontsize=11, color="#0d4f54", pad=6)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for bar, value in zip(bars, values):
        ax.text(
            min(value + 1.5, 96),
            bar.get_y() + bar.get_height() / 2,
            f"{value:.0f}%",
            va="center",
            fontsize=8,
            color="#0f172a",
        )
    return _fig_to_png(fig)


def _question_bars_png(question_feedback: list[dict[str, Any]]) -> bytes | None:
    if not question_feedback:
        return None
    items = question_feedback[:12]
    labels = []
    ratios = []
    for item in items:
        number = item.get("number", "?")
        labels.append(f"Q{number}")
        try:
            awarded = float(item.get("marks_awarded") or 0)
            max_marks = float(item.get("max_marks") or 0)
        except (TypeError, ValueError):
            awarded, max_marks = 0.0, 0.0
        ratios.append((awarded / max_marks * 100.0) if max_marks > 0 else 0.0)

    fig, ax = plt.subplots(figsize=(5.4, 2.5), facecolor="#f7fbfb")
    ax.set_facecolor("#f7fbfb")
    colors = ["#0f766e" if v >= 60 else "#f59e0b" if v >= 40 else "#e11d48" for v in ratios]
    ax.bar(labels, ratios, color=colors, width=0.65)
    ax.set_ylim(0, 105)
    ax.set_ylabel("% marks", fontsize=9)
    ax.set_title("Question-wise marks", fontsize=11, color="#0d4f54", pad=6)
    ax.tick_params(axis="x", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", linestyle="--", alpha=0.3)
    return _fig_to_png(fig)


def build_report_card_pdf(
    *,
    student_name: str,
    class_grade: int | None,
    paper_title: str,
    subject: str,
    plan_label: str,
    score: int,
    total: int,
    percent: float,
    submitted_at: datetime | None,
    chapters: list[str],
    suggestions: list[str],
    evaluation_summary: str | None = None,
    question_feedback: list[dict[str, Any]] | None = None,
    history: list[dict[str, Any]] | None = None,
    subject_averages: list[dict[str, Any]] | None = None,
) -> bytes:
    """Create an A4 PDF report card with performance visualizations."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    margin = 48
    max_y = page.rect.height - margin
    width = page.rect.width - 2 * margin

    header = fitz.Rect(0, 0, page.rect.width, 92)
    page.draw_rect(header, color=(0.05, 0.35, 0.38), fill=(0.05, 0.35, 0.38))
    page.insert_text(
        fitz.Point(margin, 42),
        "VidyaAI Report Card",
        fontsize=20,
        fontname="hebo",
        color=(1, 1, 1),
    )
    page.insert_text(
        fitz.Point(margin, 68),
        "Parental control  |  Practice & mock test summary with visuals",
        fontsize=10,
        fontname="helv",
        color=(0.78, 0.93, 0.93),
    )

    y = 118
    class_bit = f"Class {class_grade}" if class_grade else "Student"
    date_bit = submitted_at.strftime("%d %b %Y, %I:%M %p") if submitted_at else "-"

    def new_page() -> None:
        nonlocal page, y
        page = doc.new_page(width=595, height=842)
        y = margin

    def ensure(space: float = 24) -> None:
        nonlocal page, y
        if y + space > max_y:
            new_page()

    def line(
        text: str,
        *,
        size: float = 11,
        bold: bool = False,
        color: tuple[float, float, float] = (0.12, 0.16, 0.22),
        wrap: int = 88,
    ) -> None:
        nonlocal y
        font = "hebo" if bold else "helv"
        for chunk in textwrap.wrap(_safe(text), width=wrap) or [""]:
            ensure(size + 10)
            page.insert_text(fitz.Point(margin, y), chunk, fontsize=size, fontname=font, color=color)
            y += size + 7

    def rule() -> None:
        nonlocal y
        ensure(16)
        page.draw_line(
            fitz.Point(margin, y),
            fitz.Point(margin + width, y),
            color=(0.75, 0.8, 0.85),
            width=0.8,
        )
        y += 16

    def insert_png(png: bytes, *, height: float = 170) -> None:
        nonlocal y
        ensure(height + 12)
        rect = fitz.Rect(margin, y, margin + width, y + height)
        page.insert_image(rect, stream=png, keep_proportion=True)
        y += height + 10

    line(f"Student: {_safe(student_name)} ({class_bit})", size=13, bold=True)
    line(f"Test: {_safe(paper_title)}", size=12)
    line(f"Type: {_safe(plan_label)}  |  Subject: {_safe(subject)}", size=11)
    line(f"Completed: {date_bit}", size=10, color=(0.35, 0.4, 0.45))
    rule()

    ensure(64)
    score_rect = fitz.Rect(margin, y - 4, margin + width, y + 44)
    page.draw_rect(score_rect, color=(0.82, 0.92, 0.9), fill=(0.93, 0.98, 0.97), width=1)
    page.insert_text(
        fitz.Point(margin + 14, y + 26),
        f"Score: {score} / {total}    ({percent}%)",
        fontsize=16,
        fontname="hebo",
        color=(0.05, 0.35, 0.38),
    )
    y += 64

    line("Performance visualizations", size=12, bold=True)
    try:
        insert_png(_score_gauge_png(percent, score, total), height=150)
    except Exception:
        pass

    trend = _trend_chart_png(history or [])
    if trend:
        try:
            insert_png(trend, height=160)
        except Exception:
            pass

    subject_chart = _subject_bars_png(subject_averages or [])
    if subject_chart:
        try:
            insert_png(subject_chart, height=165)
        except Exception:
            pass

    question_chart = _question_bars_png(question_feedback or [])
    if question_chart:
        try:
            insert_png(question_chart, height=160)
        except Exception:
            pass

    rule()

    if chapters:
        line("Chapters covered", size=12, bold=True)
        for chapter in chapters[:12]:
            line(f"- {_safe(chapter)}", size=10)
        rule()

    if evaluation_summary:
        line("Teacher / AI summary", size=12, bold=True)
        line(_safe(evaluation_summary), size=10, wrap=90)
        rule()

    line("Chapter suggestions for improvement", size=12, bold=True)
    tips = suggestions or ["Continue regular practice and revise recent chapters."]
    for index, tip in enumerate(tips, start=1):
        line(f"{index}. {_safe(tip)}", size=10, wrap=88)
    rule()

    if question_feedback:
        line("Question-wise feedback", size=12, bold=True)
        for item in question_feedback[:20]:
            number = item.get("number", "?")
            awarded = item.get("marks_awarded", 0)
            max_marks = item.get("max_marks", 0)
            feedback = _safe(item.get("feedback"))
            text = f"Q{number}: {awarded}/{max_marks}"
            if feedback:
                text += f" - {feedback}"
            line(text, size=9, color=(0.25, 0.3, 0.35), wrap=92)

    ensure(30)
    page.insert_text(
        fitz.Point(margin, page.rect.height - 28),
        "Generated by VidyaAI for parent viewing  |  Includes student performance visuals",
        fontsize=8,
        fontname="helv",
        color=(0.5, 0.55, 0.6),
    )

    buffer = io.BytesIO()
    doc.save(buffer)
    doc.close()
    return buffer.getvalue()


def build_overall_student_pdf(
    *,
    student_name: str,
    class_grade: int | None,
    program: str | None,
    avg_score: float,
    attempts: int,
    best_mock_score: float | None,
    lectures_completed: int,
    lectures_in_progress: int,
    history: list[dict[str, Any]] | None = None,
    subject_averages: list[dict[str, Any]] | None = None,
    exam_type_scores: list[dict[str, Any]] | None = None,
    recent_attempts: list[dict[str, Any]] | None = None,
    suggestions: list[str] | None = None,
) -> bytes:
    """Full student performance PDF for admin/parent overview."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    margin = 48
    max_y = page.rect.height - margin
    width = page.rect.width - 2 * margin

    header = fitz.Rect(0, 0, page.rect.width, 92)
    page.draw_rect(header, color=(0.08, 0.28, 0.45), fill=(0.08, 0.28, 0.45))
    page.insert_text(
        fitz.Point(margin, 42),
        "VidyaAI Student Performance Report",
        fontsize=18,
        fontname="hebo",
        color=(1, 1, 1),
    )
    page.insert_text(
        fitz.Point(margin, 68),
        "Admin / school overview with visualizations",
        fontsize=10,
        fontname="helv",
        color=(0.78, 0.88, 0.95),
    )

    y = 118
    class_bit = f"Class {class_grade}" if class_grade else "Student"
    program_bit = (program or "school").upper()

    def new_page() -> None:
        nonlocal page, y
        page = doc.new_page(width=595, height=842)
        y = margin

    def ensure(space: float = 24) -> None:
        nonlocal page, y
        if y + space > max_y:
            new_page()

    def line(
        text: str,
        *,
        size: float = 11,
        bold: bool = False,
        color: tuple[float, float, float] = (0.12, 0.16, 0.22),
        wrap: int = 88,
    ) -> None:
        nonlocal y
        font = "hebo" if bold else "helv"
        for chunk in textwrap.wrap(_safe(text), width=wrap) or [""]:
            ensure(size + 10)
            page.insert_text(fitz.Point(margin, y), chunk, fontsize=size, fontname=font, color=color)
            y += size + 7

    def rule() -> None:
        nonlocal y
        ensure(16)
        page.draw_line(
            fitz.Point(margin, y),
            fitz.Point(margin + width, y),
            color=(0.75, 0.8, 0.85),
            width=0.8,
        )
        y += 16

    def insert_png(png: bytes, *, height: float = 170) -> None:
        nonlocal y
        ensure(height + 12)
        rect = fitz.Rect(margin, y, margin + width, y + height)
        page.insert_image(rect, stream=png, keep_proportion=True)
        y += height + 10

    line(f"Student: {_safe(student_name)} ({class_bit})", size=13, bold=True)
    line(f"Program: {program_bit}", size=11)
    mock_label = f"{best_mock_score}%" if best_mock_score is not None else "—"
    line(
        f"Average score: {avg_score}%  |  Attempts: {attempts}  |  Best mock: {mock_label}",
        size=11,
    )
    line(
        f"Lectures completed: {lectures_completed}  |  In progress: {lectures_in_progress}",
        size=10,
        color=(0.35, 0.4, 0.45),
    )
    rule()

    line("Performance visualizations", size=12, bold=True)
    try:
        insert_png(
            _score_gauge_png(avg_score, int(round(avg_score)), 100, title="Overall average"),
            height=150,
        )
    except Exception:
        pass

    trend = _trend_chart_png(history or [])
    if trend:
        try:
            insert_png(trend, height=160)
        except Exception:
            pass

    subject_chart = _subject_bars_png(subject_averages or [])
    if subject_chart:
        try:
            insert_png(subject_chart, height=165)
        except Exception:
            pass

    if exam_type_scores:
        exam_rows = [
            {
                "subject": str(row.get("label") or row.get("plan_type") or "Exam"),
                "avg_percent": float(row.get("avg_score") or 0),
            }
            for row in exam_type_scores
        ]
        exam_chart = _subject_bars_png(exam_rows)
        if exam_chart:
            try:
                line("Scores by exam type", size=11, bold=True)
                insert_png(exam_chart, height=160)
            except Exception:
                pass

    rule()
    line("Recent attempts", size=12, bold=True)
    attempts_list = recent_attempts or []
    if not attempts_list:
        line("No submitted practice papers yet.", size=10)
    else:
        for item in attempts_list[:12]:
            title = _safe(item.get("title") or "Paper")
            subject = _safe(item.get("subject") or "")
            pct = item.get("percent")
            line(f"- {title} ({subject}) · {pct if pct is not None else '—'}%", size=10)

    rule()
    line("Improvement focus", size=12, bold=True)
    tips = suggestions or ["Encourage consistent weekly practice across weaker subjects."]
    for index, tip in enumerate(tips, start=1):
        line(f"{index}. {_safe(tip)}", size=10)

    ensure(30)
    page.insert_text(
        fitz.Point(margin, page.rect.height - 28),
        "Generated by VidyaAI  |  School admin student performance report",
        fontsize=8,
        fontname="helv",
        color=(0.5, 0.55, 0.6),
    )

    buffer = io.BytesIO()
    doc.save(buffer)
    doc.close()
    return buffer.getvalue()


def build_class_bulk_report_pdf(
    *,
    class_label: str,
    school_name: str | None,
    students: list[dict[str, Any]],
    top_performers: list[dict[str, Any]],
) -> bytes:
    """Bulk PDF for one class: top performers + full student list."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    margin = 48
    max_y = page.rect.height - margin
    width = page.rect.width - 2 * margin

    header = fitz.Rect(0, 0, page.rect.width, 92)
    page.draw_rect(header, color=(0.1, 0.32, 0.48), fill=(0.1, 0.32, 0.48))
    page.insert_text(
        fitz.Point(margin, 40),
        f"Class Records - {class_label}",
        fontsize=18,
        fontname="hebo",
        color=(1, 1, 1),
    )
    page.insert_text(
        fitz.Point(margin, 66),
        f"{_safe(school_name) or 'School'}  |  Bulk student performance",
        fontsize=10,
        fontname="helv",
        color=(0.78, 0.9, 0.96),
    )

    y = 118

    def new_page() -> None:
        nonlocal page, y
        page = doc.new_page(width=595, height=842)
        y = margin

    def ensure(space: float = 24) -> None:
        nonlocal page, y
        if y + space > max_y:
            new_page()

    def line(
        text: str,
        *,
        size: float = 11,
        bold: bool = False,
        color: tuple[float, float, float] = (0.12, 0.16, 0.22),
        wrap: int = 90,
    ) -> None:
        nonlocal y
        font = "hebo" if bold else "helv"
        for chunk in textwrap.wrap(_safe(text), width=wrap) or [""]:
            ensure(size + 10)
            page.insert_text(fitz.Point(margin, y), chunk, fontsize=size, fontname=font, color=color)
            y += size + 7

    def rule() -> None:
        nonlocal y
        ensure(14)
        page.draw_line(
            fitz.Point(margin, y),
            fitz.Point(margin + width, y),
            color=(0.75, 0.8, 0.85),
            width=0.8,
        )
        y += 14

    def insert_png(png: bytes, *, height: float = 170) -> None:
        nonlocal y
        ensure(height + 12)
        rect = fitz.Rect(margin, y, margin + width, y + height)
        page.insert_image(rect, stream=png, keep_proportion=True)
        y += height + 10

    attempted = [s for s in students if int(s.get("attempts") or 0) > 0]
    class_avg = (
        round(sum(float(s.get("avg_score") or 0) for s in attempted) / len(attempted), 1)
        if attempted
        else 0.0
    )

    line(f"Students in class: {len(students)}  |  With attempts: {len(attempted)}", size=11)
    line(f"Class average (students with attempts): {class_avg}%", size=11, bold=True)
    rule()

    chart_rows = [
        {
            "subject": str(row.get("full_name") or "Student")[:16],
            "avg_percent": float(row.get("avg_score") or 0),
        }
        for row in (top_performers or students[:5])[:6]
        if float(row.get("avg_score") or 0) > 0 or int(row.get("attempts") or 0) > 0
    ]
    if chart_rows:
        line("Top performers", size=12, bold=True)
        chart = _subject_bars_png(chart_rows)
        if chart:
            try:
                insert_png(chart, height=170)
            except Exception:
                pass
        rule()

    line("Top performers (table)", size=12, bold=True)
    leaders = top_performers or []
    if not leaders:
        line("No submitted practice results yet in this class.", size=10)
    else:
        for index, row in enumerate(leaders[:10], start=1):
            mock = row.get("best_mock_score")
            mock_bit = f"{mock}%" if mock is not None else "-"
            line(
                f"{index}. {_safe(row.get('full_name'))} - avg {row.get('avg_score')}% "
                f"({row.get('attempts')} attempts, best mock {mock_bit})",
                size=10,
            )
    rule()

    line("All students in class", size=12, bold=True)
    for row in students:
        avg = row.get("avg_score")
        attempts = row.get("attempts") or 0
        score_bit = f"{avg}%" if attempts else "-"
        line(
            f"- {_safe(row.get('full_name'))}  |  avg {score_bit}  |  attempts {attempts}",
            size=10,
        )

    ensure(30)
    page.insert_text(
        fitz.Point(margin, page.rect.height - 28),
        "Generated by VidyaAI  |  Class bulk student records",
        fontsize=8,
        fontname="helv",
        color=(0.5, 0.55, 0.6),
    )

    buffer = io.BytesIO()
    doc.save(buffer)
    doc.close()
    return buffer.getvalue()
