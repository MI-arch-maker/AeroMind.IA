"""Database wiring for SQLite, PostgreSQL and MySQL/MariaDB deployments."""

import os
import ssl

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    elif url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://") :]
    elif url.startswith("mysql+mysqldb://"):
        url = "mysql+pymysql://" + url[len("mysql+mysqldb://") :]
    elif url.startswith("mariadb://"):
        url = "mysql+pymysql://" + url[len("mariadb://") :]
    return url or "sqlite:///./data/aeromind.db"


class Base(DeclarativeBase):
    pass


_engine_url = database_url()


def _mysql_tls_connect_args() -> dict[str, object]:
    """Return verified TLS settings required by TiDB Cloud Serverless.

    PyMySQL does not enable TLS merely because the server supports it. TiDB
    Cloud Serverless rejects the resulting plaintext handshake, so build a
    standard-library SSL context and pass it through SQLAlchemy's connect_args.
    The system CA bundle is used by default; AEROMIND_DB_CA can override it
    for installations using a private CA.
    """
    ca_file = os.getenv("AEROMIND_DB_CA", "").strip() or None
    tls_context = ssl.create_default_context(cafile=ca_file)
    tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
    return {"ssl": tls_context}


if _engine_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif _engine_url.startswith("mysql+pymysql://"):
    connect_args = _mysql_tls_connect_args()
else:
    connect_args = {}
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
