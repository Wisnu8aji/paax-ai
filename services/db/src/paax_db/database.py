from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/paax")

async_url = DATABASE_URL
if async_url.startswith("postgresql://"):
    async_url = async_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif async_url.startswith("postgresql+psycopg2://"):
    async_url = async_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
elif async_url.startswith("postgresql+psycopg://"):
    async_url = async_url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)

_is_sqlite = async_url.startswith("sqlite")

if _is_sqlite:
    # aiosqlite accepts a `timeout` connect arg (seconds to wait on a locked db).
    # Set 30 s to absorb transient lock contention between the web sync-poll and
    # the durable-job worker leasing from the same SQLite file.
    engine = create_async_engine(async_url, echo=True, connect_args={"timeout": 30})

    # Enable WAL journal mode and busy_timeout via the underlying sqlite3 driver
    # connection hook.  WAL allows concurrent readers alongside a single writer
    # (vs. the default DELETE/rollback journal that serialises everything).
    # busy_timeout at the sqlite3 layer is a belt-and-suspenders complement to
    # the aiosqlite timeout above.
    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()
else:
    engine = create_async_engine(async_url, echo=True)

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
