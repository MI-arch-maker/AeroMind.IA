"""Database wiring for SQLite, PostgreSQL and MySQL/MariaDB deployments."""

import os
import ssl

from sqlalchemy import create_engine, event, inspect, text
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
    # V6 — for :memory: SQLite, use StaticPool so all connections share the
    # same in-memory database. Without this, each SessionLocal() call opens
    # a new connection to a fresh empty DB, and tables created by
    # create_all() are invisible to subsequent queries. This was masked
    # when tests used file-based SQLite, but :memory: (set by some test
    # modules at import time via os.environ.setdefault) requires the pool.
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        _engine_url,
        pool_pre_ping=True,
        connect_args=connect_args,
        poolclass=StaticPool if ":memory:" in _engine_url else None,
    )
elif _engine_url.startswith("mysql+pymysql://"):
    connect_args = _mysql_tls_connect_args()
    engine = create_engine(_engine_url, pool_pre_ping=True, connect_args=connect_args)
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


def ensure_project_lifecycle_columns() -> None:
    """Add missing lifecycle columns to an already-provisioned project table."""
    dialect = engine.dialect.name
    if dialect == "sqlite":
        existing = {column["name"] for column in inspect(engine).get_columns("projects")}
        if not existing:
            return
    elif dialect == "mysql":
        with engine.connect() as connection:
            existing = {
                row[0] for row in connection.execute(text(
                    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects'"
                ))
            }
        if not existing:
            return
    elif dialect == "postgresql":
        with engine.connect() as connection:
            existing = {
                row[0] for row in connection.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = 'projects'"
                ))
            }
        if not existing:
            return
    else:
        return

    deleted_at_type = "TIMESTAMPTZ" if dialect == "postgresql" else "DATETIME"
    statements = []
    if "status" not in existing:
        statements.append("ALTER TABLE projects ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'")
    if "deleted_at" not in existing:
        statements.append(f"ALTER TABLE projects ADD COLUMN deleted_at {deleted_at_type} NULL")
    if "deleted_by" not in existing:
        statements.append("ALTER TABLE projects ADD COLUMN deleted_by VARCHAR(120) NULL")
    if statements:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))


def ensure_simulation_status_column() -> None:
    """Add the durable simulation status column without replacing existing data."""
    inspector = inspect(engine)
    if "simulations" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("simulations")}
    if "status" in existing:
        return
    # This ADD COLUMN form is accepted by SQLite, PostgreSQL and MySQL/TiDB;
    # the constant default backfills legacy rows without a destructive rewrite.
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE simulations ADD COLUMN status VARCHAR(32) "
            "NOT NULL DEFAULT 'COMPLETED'"
        ))


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
