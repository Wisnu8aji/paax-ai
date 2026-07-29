"""Seed DB with Gedung A 53-page DEM run for task-local E2E testing."""
import asyncio
import json
import logging
import os
from pathlib import Path
import sys

# Ensure paax_db is in sys.path
repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root / "services" / "db" / "src"))

from paax_db.data_root import resolve_data_root

data_root = resolve_data_root()
db_file = data_root / "db" / "portable.sqlite"
db_file.parent.mkdir(parents=True, exist_ok=True)

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file}"
os.environ["PAAX_DESKTOP_MODE"] = "1"

from sqlalchemy.future import select
from paax_db.database import async_session_maker, engine
from paax_db import models

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RUN_ID = "dc470744-4864-490c-b074-423cb60e1e61"
PROJECT_ID = "proj-clean"
ACTORS = ["local-desktop-user", "service-account", "paax-web", "paax-test"]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

    async with async_session_maker() as session:
        # Ensure project exists
        project = await session.get(models.Project, PROJECT_ID)
        if not project:
            project = models.Project(
                id=PROJECT_ID,
                owner_id="local-desktop-user",
                name="Gedung A Architecture Project",
                status="active",
                description="53-page Architecture Fixture",
                progress=100,
                warnings=0,
                health=100,
                last_activity="Seeded 53-page GEDUNG A",
            )
            session.add(project)

        for actor in ACTORS:
            member = await session.get(models.ProjectMember, {"project_id": PROJECT_ID, "user_id": actor})
            if not member:
                session.add(models.ProjectMember(project_id=PROJECT_ID, user_id=actor, role="owner"))

        run = await session.get(models.DemRun, RUN_ID)
        if not run:
            run = models.DemRun(
                id=RUN_ID,
                project_id=PROJECT_ID,
                document_id="doc-gedung-a",
                document_hash="7b4151c7ec7c87588b1c858cb0fb77ffdeca550ecb4c041714b3643ecd4b4510",
                file_name="gambar-kerja-arsitektur-gedung-a.pdf",
                total_pages=53,
                status="synthesis_complete",
                provider="paax-vision",
                prompt_version="dem-extraction-v1.0.0",
                artifact_key=f"drawing-intelligence/runs/{RUN_ID}",
            )
            session.add(run)

        existing_pages = set((await session.execute(
            select(models.DemPage.page_index).where(models.DemPage.run_id == RUN_ID)
        )).scalars().all())

        for page_index in range(53):
            if page_index not in existing_pages:
                session.add(models.DemPage(
                    run_id=RUN_ID,
                    page_index=page_index,
                    status="completed",
                    attempt_count=1,
                    input_hash="7b4151c7ec7c87588b1c858cb0fb77ffdeca550ecb4c041714b3643ecd4b4510",
                    result={
                        "source": {
                            "document_hash": "7b4151c7ec7c87588b1c858cb0fb77ffdeca550ecb4c041714b3643ecd4b4510",
                            "file_name": "gambar-kerja-arsitektur-gedung-a.pdf",
                            "page_index": page_index,
                            "width_px": 842,
                            "height_px": 1191,
                        },
                        "sheet_identity": {
                            "sheet_number": {"value": f"A-{page_index+1:02d}", "confidence": 0.95},
                            "title": {"value": f"Sheet {page_index+1}", "confidence": 0.95},
                            "discipline": {"value": "architecture", "confidence": 0.95},
                            "level": {"value": "L1" if page_index < 20 else "L2", "confidence": 0.95},
                        }
                    }
                ))

        await session.commit()
        print(f"Successfully seeded DB for project {PROJECT_ID} with run {RUN_ID} for actors {ACTORS}.")


if __name__ == "__main__":
    asyncio.run(seed())
