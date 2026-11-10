"""Strip characters that PostgreSQL text columns cannot store."""


def sanitize_db_text(value: str | None) -> str | None:
    """Remove NUL bytes and other disallowed control characters from text."""
    if value is None:
        return None
    if not value:
        return value
    # PostgreSQL rejects NUL in string literals; some PDF extractors emit them.
    cleaned = value.replace("\x00", "")
    return "".join(ch for ch in cleaned if ch == "\n" or ch == "\t" or ch >= " " or ch == "\r")
