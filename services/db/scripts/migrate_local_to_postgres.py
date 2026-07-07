import sys
from pathlib import Path

# Add src to sys.path so we can import paax_db
sys.path.append(str(Path(__file__).resolve().parent.parent / "src"))

import asyncio
import json
from paax_db import models
from paax_db.database import async_session_maker
from sqlalchemy.future import select

async def run_migration():
    data_file = Path(__file__).parent / "dummy_data.json"
    with open(data_file, "r") as f:
        projects = json.load(f)
        
    print(f"Loading {len(projects)} projects from {data_file}")
    
    async with async_session_maker() as session:
        for project_data in projects:
            # Check if project exists
            result = await session.execute(
                select(models.Project).where(models.Project.id == project_data["id"])
            )
            existing = result.scalars().first()
            if existing:
                print(f"Project {project_data['id']} already exists, skipping.")
                continue
                
            project = models.Project(**project_data)
            session.add(project)
            print(f"Added project: {project.name}")
            
        await session.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(run_migration())
