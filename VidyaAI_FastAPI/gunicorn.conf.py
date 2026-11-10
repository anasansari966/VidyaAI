"""Production ASGI settings — use with: gunicorn app.main:app -c gunicorn.conf.py"""

import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "127.0.0.1:8000")

_web_concurrency = os.getenv("WEB_CONCURRENCY")
if _web_concurrency:
    workers = max(1, int(_web_concurrency))
else:
    workers = max(2, (multiprocessing.cpu_count() * 2) + 1)

worker_class = "uvicorn.workers.UvicornWorker"
timeout = int(os.getenv("GUNICORN_TIMEOUT", "600"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = 5
preload_app = True
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
