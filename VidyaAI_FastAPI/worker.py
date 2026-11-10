"""Optional standalone worker entry point (same in-process worker also starts on API boot)."""

from app.services.job_queue import _ensure_worker, reload_pending_jobs

if __name__ == "__main__":
    reloaded = reload_pending_jobs()
    _ensure_worker()
    print(f"VidyaAI worker running ({reloaded} pending job(s) re-queued). Press Ctrl+C to stop.")
    import time

    while True:
        time.sleep(3600)
