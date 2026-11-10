"""Student-facing service permissions assigned via access roles."""

import json

ALL_SERVICE_PERMISSIONS: tuple[str, ...] = (
    "schedule",
    "lectures",
    "recordings",
    "practice",
    "support",
)

SERVICE_PERMISSION_LABELS: dict[str, str] = {
    "schedule": "My Schedule",
    "lectures": "Live Class",
    "recordings": "Recordings",
    "practice": "Practice",
    "support": "Support",
}

DEFAULT_FULL_PERMISSIONS: list[str] = list(ALL_SERVICE_PERMISSIONS)


def normalize_permissions(raw: list[str] | None) -> list[str]:
    if not raw:
        return list(DEFAULT_FULL_PERMISSIONS)
    allowed = set(ALL_SERVICE_PERMISSIONS)
    cleaned = [p for p in raw if p in allowed]
    return cleaned or list(DEFAULT_FULL_PERMISSIONS)


def permissions_to_json(permissions: list[str]) -> str:
    return json.dumps(normalize_permissions(permissions))


def permissions_from_json(raw: str | None) -> list[str]:
    if not raw:
        return list(DEFAULT_FULL_PERMISSIONS)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return normalize_permissions([str(p) for p in parsed])
    except (json.JSONDecodeError, TypeError):
        pass
    return list(DEFAULT_FULL_PERMISSIONS)
