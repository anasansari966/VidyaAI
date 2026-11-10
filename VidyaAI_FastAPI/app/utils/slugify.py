import re


def slugify(value: str, *, max_length: int = 80) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[-\s]+", "-", value).strip("-")
    return (value[:max_length].rstrip("-") or "untitled")
