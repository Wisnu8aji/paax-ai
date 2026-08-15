"""Initialize local persistent database with PLHUT baseline using production bootstrap logic."""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# DATABASE_URL must be selected before *any* paax_db import.  The package
# initialiser imports repository types which in turn initialise the SQLAlchemy
# engine; resolving the data root through paax_db before this assignment caused
# a portable launch to retain a caller's PostgreSQL URL.  The portable launcher
# supplies PAAX_DATA_ROOT explicitly, while this fallback retains the documented
# local default for direct invocation.
data_root = Path(os.environ.get("PAAX_DATA_ROOT", "D:/paax-data")).expanduser().resolve()
db_file = data_root / "db" / "portable.sqlite"
db_file.parent.mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file}"
os.environ["PAAX_DESKTOP_MODE"] = "1"

from paax_db.database import async_session_maker, engine
from paax_db.reference_bootstrap import bootstrap_reference_project

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = (
    REPO_ROOT / "fixtures" / "plhut" / "project-manifest.json"
    if (REPO_ROOT / "fixtures" / "plhut" / "project-manifest.json").exists()
    else REPO_ROOT / "scripts" / "live_test" / "fixtures" / "plhut" / "project-manifest.json"
)

# Fixed actor identity for local desktop use cases
PORTABLE_ACTOR_ID = "local-desktop-user"


async def bootstrap_plhut() -> dict:
    if not MANIFEST_PATH.exists():
        raise RuntimeError(f"Manifest not found: {MANIFEST_PATH}")

    logger.info(f"Using database: {db_file}")

    # Ensure schema is up to date (this creates tables for sqlite)
    from paax_db.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Legacy portable databases created via create_all have no Alembic row.
    # Audit/stamp/apply explicitly before serving any authenticated request;
    # package-index readers never perform schema work themselves.
    portable_scripts = REPO_ROOT / "scripts" / "portable"
    if str(portable_scripts) not in sys.path:
        sys.path.insert(0, str(portable_scripts))
    from migrate_portable_schema import migrate
    migrate(REPO_ROOT, db_file, backup=False)

    async with async_session_maker() as session:
        result = await bootstrap_reference_project(
            session=session,
            manifest_path=MANIFEST_PATH,
            actor_id=PORTABLE_ACTOR_ID,
            reference_key="plhut-surakarta-2024",
            is_default=True,
        )
        await session.commit()
        return result


async def main() -> None:
    try:
        status = await bootstrap_plhut()
        print("PLHUT PORTABLE BOOTSTRAP:", json.dumps(status, ensure_ascii=False))
        print(f"Persistent DB: {db_file}")
    except Exception as e:
        logger.error(f"Bootstrap failed: {e}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
    import uvicorn
    uvicorn.run("paax_db.main:app", host="127.0.0.1", port=8001, log_level="info")
