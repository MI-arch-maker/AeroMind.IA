"""Database wiring for AeroMind business records (SQLite locally, PostgreSQL in production)."""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url or "sqlite:///./data/aeromind.db"


class Base(DeclarativeBase):
    pass


_engine_url = database_url()
connect_args = {"check_same_thread": False} if _engine_url.startswith("sqlite") else {}
engine = create_engine(_engine_url, pool_pre_ping=True, connect_args=connect_args)
if _engine_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping_database() -> bool:
    from sqlalchemy import text

    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
