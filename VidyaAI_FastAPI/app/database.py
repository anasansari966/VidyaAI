from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

_is_sqlite = settings.is_sqlite

connect_args: dict = {"check_same_thread": False, "timeout": 60} if _is_sqlite else {}

engine_kwargs: dict = {"connect_args": connect_args, "pool_pre_ping": True}
if _is_sqlite:
    engine_kwargs["poolclass"] = NullPool
else:
    # Supabase Session/Transaction pooler (6543) already pools connections.
    # A second QueuePool exhausts the pooler and causes login timeouts.
    using_supabase_pooler = bool(settings.supabase_db_host.strip())
    if using_supabase_pooler or settings.supabase_db_port == 6543:
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_size"] = 8
        engine_kwargs["max_overflow"] = 20
        engine_kwargs["pool_timeout"] = 60
        engine_kwargs["pool_recycle"] = 280

engine = create_engine(settings.resolved_database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
