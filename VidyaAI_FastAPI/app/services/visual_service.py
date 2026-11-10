import re

from app.config import settings


def _clean_script(script: str) -> str:
    lines: list[str] = []
    for line in script.splitlines():
        stripped = line.strip()
        if stripped in {"---", "***", "___"}:
            lines.append("")
            continue
        if stripped.startswith("#"):
            stripped = re.sub(r"^#+\s*", "", stripped)
        if stripped:
            lines.append(stripped)
    return "\n\n".join(lines)


def split_script_into_segments(script: str, max_segments: int | None = None) -> list[str]:
    cleaned = _clean_script(script)
    max_segments = max_segments or settings.max_visual_frames

    parts = [p.strip() for p in re.split(r"\n\s*\n", cleaned) if p.strip()]
    if not parts:
        return [cleaned[:1200]] if cleaned else []

    if len(parts) <= max_segments:
        return parts

    chunk_size = max(1, len(parts) // max_segments)
    segments: list[str] = []
    for index in range(0, len(parts), chunk_size):
        block = "\n\n".join(parts[index : index + chunk_size]).strip()
        if block:
            segments.append(block)
        if len(segments) >= max_segments:
            break

    return segments[:max_segments]


def segment_timings(segments: list[str], total_seconds: float) -> list[tuple[float, float]]:
    weights = [max(len(s.split()), 1) for s in segments]
    total_weight = sum(weights)
    timings: list[tuple[float, float]] = []
    cursor = 0.0

    for weight in weights:
        duration = (weight / total_weight) * total_seconds
        timings.append((cursor, duration))
        cursor += duration

    return timings
