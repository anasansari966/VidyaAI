"""In-process job queue backed by the processing_jobs table."""

import json
import logging
import queue
import threading
from typing import Any

from app.database import SessionLocal
from app.models.processing_job import JobStatus, ProcessingJob
from app.services.book_processing_service import run_processing_job

logger = logging.getLogger(__name__)

_task_queue: queue.Queue[int] = queue.Queue()
_worker_lock = threading.Lock()
_worker_count = 0
_workers_started = False
_MAX_WORKERS = 3


def enqueue_job(job_type: str, book_id: int, payload: dict[str, Any] | None = None) -> int:
    db = SessionLocal()
    try:
        job = ProcessingJob(
            job_type=job_type,
            book_id=book_id,
            payload=json.dumps(payload or {}),
            status=JobStatus.PENDING.value,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id
    finally:
        db.close()

    _task_queue.put(job_id)
    _ensure_worker()
    return job_id


def _ensure_worker() -> None:
    global _worker_count, _workers_started
    with _worker_lock:
        while _worker_count < _MAX_WORKERS:
            thread = threading.Thread(
                target=_worker_loop,
                name=f"vidyaai-job-worker-{_worker_count + 1}",
                daemon=True,
            )
            thread.start()
            _worker_count += 1
        if not _workers_started:
            _workers_started = True
            logger.info("Started %s VidyaAI background job worker(s)", _MAX_WORKERS)


def _worker_loop() -> None:
    while True:
        job_id = _task_queue.get()
        try:
            run_processing_job(job_id)
        except Exception:
            logger.exception("Unhandled failure running job %s", job_id)
        finally:
            _task_queue.task_done()


def reload_pending_jobs() -> int:
    """Re-queue pending jobs after API restart."""
    db = SessionLocal()
    try:
        pending = (
            db.query(ProcessingJob.id)
            .filter(ProcessingJob.status == JobStatus.PENDING.value)
            .order_by(ProcessingJob.id)
            .all()
        )
        for (job_id,) in pending:
            _task_queue.put(job_id)
    finally:
        db.close()

    if pending:
        _ensure_worker()
    return len(pending)
