API_ROOT_PREFIX = "/vidyaai"


def api_path(path: str) -> str:
    """Build a client-facing API path under the VidyaAI root prefix."""
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{API_ROOT_PREFIX}{path}"
