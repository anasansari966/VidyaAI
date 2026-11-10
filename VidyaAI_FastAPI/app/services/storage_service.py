import logging
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings

logger = logging.getLogger(__name__)

_s3_client = None


class StorageUnavailableError(RuntimeError):
    """Raised when configured object storage cannot be reached safely."""


def _storage_error(operation: str, exc: Exception) -> StorageUnavailableError:
    logger.warning("S3 %s failed: %s", operation, exc.__class__.__name__)
    return StorageUnavailableError("File storage is temporarily unavailable.")


def s3_enabled() -> bool:
    return settings.s3_configured


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region or settings.aws_region,
            config=Config(
                connect_timeout=3,
                read_timeout=15,
                retries={"total_max_attempts": 1, "mode": "standard"},
            ),
        )
    return _s3_client


def is_storage_key(ref: str) -> bool:
    return ref.startswith("uploads/")


def local_path_for_key(key: str) -> Path:
    if not is_storage_key(key):
        return Path(key)
    return Path(settings.upload_dir) / key.removeprefix("uploads/")


def resolve_path(ref: str) -> Path:
    if is_storage_key(ref):
        return local_path_for_key(ref)
    return Path(ref)


def write_bytes(ref: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    if s3_enabled() and is_storage_key(ref):
        get_s3_client().put_object(
            Bucket=settings.s3_bucket_name,
            Key=ref,
            Body=data,
            ContentType=content_type,
        )
        logger.debug("Wrote S3 object s3://%s/%s", settings.s3_bucket_name, ref)
        return ref

    path = local_path_for_key(ref) if is_storage_key(ref) else Path(ref)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path) if not is_storage_key(ref) else ref


def read_bytes(ref: str) -> bytes:
    if s3_enabled() and is_storage_key(ref):
        response = get_s3_client().get_object(Bucket=settings.s3_bucket_name, Key=ref)
        return response["Body"].read()

    path = resolve_path(ref)
    return path.read_bytes()


def exists(ref: str) -> bool:
    if not ref:
        return False

    if s3_enabled() and is_storage_key(ref):
        try:
            get_s3_client().head_object(Bucket=settings.s3_bucket_name, Key=ref)
            return True
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise _storage_error("existence check", exc) from exc
        except BotoCoreError as exc:
            raise _storage_error("existence check", exc) from exc

    return resolve_path(ref).exists()


def delete(ref: str) -> None:
    if not ref:
        return

    if s3_enabled() and is_storage_key(ref):
        try:
            get_s3_client().delete_object(Bucket=settings.s3_bucket_name, Key=ref)
        except ClientError as exc:
            logger.warning("Failed to delete S3 object %s: %s", ref, exc)
        return

    path = resolve_path(ref)
    if path.exists():
        path.unlink(missing_ok=True)


@contextmanager
def local_read_path(ref: str, *, suffix: str = "") -> Iterator[Path]:
    """Provide a local filesystem path for libraries that need open()/fitz."""
    if s3_enabled() and is_storage_key(ref):
        data = read_bytes(ref)
        with tempfile.NamedTemporaryFile(suffix=suffix or Path(ref).suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        try:
            yield tmp_path
        finally:
            tmp_path.unlink(missing_ok=True)
        return

    path = resolve_path(ref)
    if not path.exists():
        raise FileNotFoundError(ref)
    yield path


def write_from_temp_file(
    ref: str,
    writer: Callable[[Path], None],
    *,
    content_type: str = "application/octet-stream",
    suffix: str = "",
) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix or Path(ref).suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        writer(tmp_path)
        data = tmp_path.read_bytes()
        return write_bytes(ref, data, content_type=content_type)
    finally:
        tmp_path.unlink(missing_ok=True)


def storage_file_response(
    ref: str,
    media_type: str,
    headers: dict[str, str] | None = None,
):
    response_headers = dict(headers or {})

    if s3_enabled() and is_storage_key(ref):
        try:
            obj = get_s3_client().get_object(Bucket=settings.s3_bucket_name, Key=ref)
        except ClientError as exc:
            error_code = str(exc.response.get("Error", {}).get("Code", ""))
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                raise FileNotFoundError(ref) from exc
            raise _storage_error("download", exc) from exc
        except BotoCoreError as exc:
            raise _storage_error("download", exc) from exc
        if obj.get("ContentLength") is not None:
            response_headers.setdefault("Content-Length", str(obj["ContentLength"]))
        return StreamingResponse(
            obj["Body"],
            media_type=media_type,
            headers=response_headers,
        )

    path = resolve_path(ref)
    if not path.exists():
        raise FileNotFoundError(ref)
    return FileResponse(path, media_type=media_type, headers=response_headers)
