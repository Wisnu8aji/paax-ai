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

engine = create_async_engine(async_url, echo=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
