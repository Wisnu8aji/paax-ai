import os
from typing import List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from . import models, schemas
from .database import get_db

app = FastAPI(title="PAAX DB API", description="Server-side persistent storage for PAAX AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/projects", response_model=List[schemas.ProjectResponse])
async def list_projects(owner_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(models.Project)
    if owner_id:
        query = query.where(models.Project.owner_id == owner_id)
    
    result = await db.execute(query)
    return result.scalars().all()

@app.post("/projects", response_model=schemas.ProjectResponse)
async def create_project(project: schemas.ProjectCreate, db: AsyncSession = Depends(get_db)):
    # Check if project exists
    result = await db.execute(select(models.Project).where(models.Project.id == project.id))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Project with this ID already exists")
    
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)
    return db_project

@app.get("/projects/{id}", response_model=schemas.ProjectResponse)
async def get_project(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).where(models.Project.id == id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.put("/projects/{id}", response_model=schemas.ProjectResponse)
async def update_project(id: str, project_update: schemas.ProjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).where(models.Project.id == id))
    db_project = result.scalars().first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = project_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
    
    await db.commit()
    await db.refresh(db_project)
    return db_project

@app.get("/projects/{id}/rab")
async def get_rab(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.RabDraft).where(models.RabDraft.project_id == id))
    rab = result.scalars().first()
    if not rab:
        return {"payload": None}
    return {"payload": rab.payload}

@app.put("/projects/{id}/rab")
async def save_rab(id: str, rab_data: schemas.RabPayload, db: AsyncSession = Depends(get_db)):
    # Upsert logic
    result = await db.execute(select(models.RabDraft).where(models.RabDraft.project_id == id))
    db_rab = result.scalars().first()
    
    if db_rab:
        db_rab.payload = rab_data.payload
    else:
        db_rab = models.RabDraft(project_id=id, payload=rab_data.payload)
        db.add(db_rab)
        
    await db.commit()
    return {"status": "success"}

@app.get("/projects/{id}/tkg")
async def get_tkg(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.TkgRecord).where(models.TkgRecord.project_id == id))
    tkg = result.scalars().first()
    if not tkg:
        return {"payload": None}
    return {"payload": tkg.payload}

@app.put("/projects/{id}/tkg")
async def save_tkg(id: str, tkg_data: schemas.TkgPayload, db: AsyncSession = Depends(get_db)):
    # Upsert logic
    result = await db.execute(select(models.TkgRecord).where(models.TkgRecord.project_id == id))
    db_tkg = result.scalars().first()
    
    if db_tkg:
        db_tkg.payload = tkg_data.payload
    else:
        db_tkg = models.TkgRecord(project_id=id, payload=tkg_data.payload)
        db.add(db_tkg)
        
    await db.commit()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("paax_db.main:app", host="0.0.0.0", port=port, reload=True)
