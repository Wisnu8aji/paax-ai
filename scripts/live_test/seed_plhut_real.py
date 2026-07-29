"""Seed DB with real PLHUT Surakarta 88-page reference dataset for Phase 09E Correction Round 1."""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Add services/db/src and services/document-intelligence to sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "db" / "src"))
sys.path.insert(0, str(REPO_ROOT / "services" / "document-intelligence"))

from paax_db.data_root import resolve_data_root

# Ensure portable sqlite location
db_file = REPO_ROOT / "services" / "db" / "portable.sqlite"
db_file.parent.mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file}"
os.environ["PAAX_DESKTOP_MODE"] = "1"

from sqlalchemy.future import select
from paax_db.database import async_session_maker, engine
from paax_db import models
from paax_db.reference_bootstrap import bootstrap_reference_project

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MANIFEST_PATH = REPO_ROOT / "fixtures" / "plhut" / "project-manifest.json"
ACTORS = ["paax-web", "local-desktop-user", "service-account", "paax-test"]


async def seed_real_plhut() -> dict:
    if not MANIFEST_PATH.exists():
        raise RuntimeError(f"PLHUT Manifest not found at: {MANIFEST_PATH}")

    logger.info(f"Seeding SQLite database: {db_file}")

    # Ensure schema is created
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    async with async_session_maker() as session:
        # Bootstrap main reference project
        status = await bootstrap_reference_project(
            session=session,
            manifest_path=MANIFEST_PATH,
            actor_id="paax-web",
            reference_key="plhut-surakarta-2024",
            is_default=True,
        )

        # Ensure project members exist for all actor identities
        project_id = "PLHUT-SURAKARTA"
        for actor in ACTORS:
            member = await session.get(models.ProjectMember, {"project_id": project_id, "user_id": actor})
            if not member:
                session.add(models.ProjectMember(project_id=project_id, user_id=actor, role="owner"))

        # Validate civil work items dataset
        from paax_db.main import _load_civil_work_items
        cwi = _load_civil_work_items(project_id)
        status["civil_work_items_count"] = len(cwi.get("items", []))

        await session.commit()
        return status


async def main() -> None:
    try:
        status = await seed_real_plhut()
        print("SEED REAL PLHUT SUCCESS:", json.dumps(status, ensure_ascii=False, indent=2))
        print(f"Database ready at: {db_file}")
    except Exception as e:
        logger.error(f"Seed real PLHUT failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
