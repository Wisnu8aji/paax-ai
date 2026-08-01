import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")
os.environ.setdefault("INTERNAL_SERVICE_SCOPES", "dem:read,dem:write,dem:delete,project_graph:synthesize,dem:authorize-actor,agent:calculate,human:approve")
# Existing suite fixtures deliberately exercise the documented rollback path;
# production portable startup leaves this compatibility flag unset.
os.environ.setdefault("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT", "1")

from paax_db.database import Base, get_db
from paax_db.main import app


test_engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = async_sessionmaker(test_engine, expire_on_commit=False)


@event.listens_for(test_engine.sync_engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    """Match PostgreSQL semantics in every test, not only after a test happens
    to execute PRAGMA foreign_keys=ON on the shared StaticPool connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


async def override_get_db():
    async with TestSession() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


async def reset_schema():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


@pytest.fixture(autouse=True)
def clean_test_database():
    asyncio.run(reset_schema())
    yield
    asyncio.run(reset_schema())
