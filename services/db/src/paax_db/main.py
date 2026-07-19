import os
import datetime
import hashlib
import json
from typing import List, Dict, Any, Optional
from sqlalchemy import delete
import uuid
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from . import models, schemas
from .database import get_db
from .auth import get_current_user, RoleChecker, User
from .project_graph_repository import build_and_activate_snapshot, get_active_snapshot
from .project_graph_retrieval import OCCURRENCE_CARDINALITY_NOTE, retrieve_project_graph
from .project_graph_rab_bridge import build_rab_bridge_proposal
from .project_graph_review import active_correction_overlays, build_quantity_readiness, build_review_queue

app = FastAPI(title="PAAX DB API", description="Server-side persistent storage for PAAX AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _as_aware_utc(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/projects", response_model=List[schemas.ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # R10: Enforce user.uid scoping
    query = select(models.Project).where(models.Project.owner_id == user.uid)
    result = await db.execute(query)
    return result.scalars().all()

@app.post("/projects", response_model=schemas.ProjectResponse)
async def create_project(project: schemas.ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(models.Project).where(models.Project.id == project.id))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Project with this ID already exists")
    
    # Force owner_id to user.uid
    project_dict = project.model_dump()
    project_dict["owner_id"] = user.uid
    db_project = models.Project(**project_dict)
    db.add(db_project)
    
    # Auto-add to members
    member = models.ProjectMember(project_id=project.id, user_id=user.uid, role="owner")
    db.add(member)
    
    await db.commit()
    await db.refresh(db_project)
    return db_project

@app.get("/projects/{id}", response_model=schemas.ProjectResponse, dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))])
async def get_project(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).where(models.Project.id == id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.put("/projects/{id}", response_model=schemas.ProjectResponse, dependencies=[Depends(RoleChecker(["owner"]))])
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

@app.get("/projects/{id}/rab", dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))])
async def get_rab(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.RabDraft).where(models.RabDraft.project_id == id))
    rab = result.scalars().first()
    if not rab:
        return {"payload": None}
    return {"payload": rab.payload}

@app.put("/projects/{id}/rab", dependencies=[Depends(RoleChecker(["estimator", "pm", "owner"]))])
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

@app.get("/projects/{id}/tkg", dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))])
async def get_tkg(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.TkgRecord).where(models.TkgRecord.project_id == id))
    tkg = result.scalars().first()
    if not tkg:
        return {"payload": None}
    return {"payload": tkg.payload}

@app.put("/projects/{id}/tkg", dependencies=[Depends(RoleChecker(["estimator", "pm", "owner"]))])
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

@app.post("/audit/tool-call", response_model=schemas.ToolCallAuditResponse, dependencies=[Depends(get_current_user)])
async def create_tool_call_audit(audit: schemas.ToolCallAuditCreate, db: AsyncSession = Depends(get_db)):
    db_audit = models.ToolCallAudit(**audit.model_dump())
    db.add(db_audit)
    await db.commit()
    await db.refresh(db_audit)
    return db_audit

@app.post("/knowledge/index", dependencies=[Depends(get_current_user)])
async def index_knowledge(chunk: schemas.KnowledgeChunkCreate, db: AsyncSession = Depends(get_db)):
    # Upsert by source_type + source_ref + id
    result = await db.execute(
        select(models.KnowledgeChunk)
        .where(
            models.KnowledgeChunk.source_type == chunk.source_type,
            models.KnowledgeChunk.source_ref == chunk.source_ref,
            models.KnowledgeChunk.id == chunk.id
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.content = chunk.content
        existing.embedding = chunk.embedding
        existing.metadata_json = chunk.metadata_json
    else:
        new_chunk = models.KnowledgeChunk(
            id=chunk.id,
            source_type=chunk.source_type,
            source_ref=chunk.source_ref,
            content=chunk.content,
            embedding=chunk.embedding,
            metadata_json=chunk.metadata_json
        )
        db.add(new_chunk)
    await db.commit()
    return {"status": "success"}

@app.post("/knowledge/search", response_model=List[schemas.KnowledgeChunkResponse], dependencies=[Depends(get_current_user)])
async def search_knowledge(req: schemas.KnowledgeSearchRequest, db: AsyncSession = Depends(get_db)):
    query = select(models.KnowledgeChunk)
    if req.source_type:
        query = query.where(models.KnowledgeChunk.source_type == req.source_type)

    bind = db.get_bind()
    dialect_name = bind.dialect.name if bind is not None else "postgresql"

    if dialect_name == "postgresql" and models.HAS_VECTOR:
        query = query.order_by(models.KnowledgeChunk.embedding.cosine_distance(req.query_embedding)).limit(req.top_k)
        result = await db.execute(query)
        return result.scalars().all()

    result = await db.execute(query)
    chunks = result.scalars().all()
    return sorted(
        chunks,
        key=lambda chunk: _cosine_distance(chunk.embedding or [], req.query_embedding),
    )[:req.top_k]


def _cosine_distance(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 1.0
    dot = sum(a * b for a, b in zip(left, right))
    norm_left = sum(a * a for a in left) ** 0.5
    norm_right = sum(b * b for b in right) ** 0.5
    if norm_left == 0 or norm_right == 0:
        return 1.0
    return 1.0 - (dot / (norm_left * norm_right))

@app.post("/usage/log", response_model=schemas.AiUsageLogResponse, dependencies=[Depends(get_current_user)])
async def log_usage(log_data: schemas.AiUsageLogCreate, db: AsyncSession = Depends(get_db)):
    db_log = models.AiUsageLog(**log_data.model_dump())
    db.add(db_log)
    
    # Increment quota usage if it's a tenant
    if log_data.tenant_id:
        result = await db.execute(select(models.TenantQuota).where(models.TenantQuota.tenant_id == log_data.tenant_id))
        quota = result.scalars().first()
        if not quota:
            quota = models.TenantQuota(
                tenant_id=log_data.tenant_id,
                plan="free",
                monthly_ai_calls_limit=100,
                monthly_ai_calls_used=0,
                reset_at=_utc_now() + datetime.timedelta(days=30),
            )
            db.add(quota)
        quota.monthly_ai_calls_used += 1

    await db.commit()
    await db.refresh(db_log)
    return db_log

@app.get("/usage/summary", response_model=schemas.UsageSummaryResponse, dependencies=[Depends(get_current_user)])
async def get_usage_summary(tenant_id: str, period: str = "monthly", db: AsyncSession = Depends(get_db)):
    # Very simple summary implementation
    query = select(models.AiUsageLog).where(models.AiUsageLog.tenant_id == tenant_id)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    total_in = sum(l.tokens_in or 0 for l in logs)
    total_out = sum(l.tokens_out or 0 for l in logs)
    ops_count = {}
    hits = 0
    total = len(logs)
    
    for l in logs:
        ops_count[l.operation] = ops_count.get(l.operation, 0) + 1
        if l.cache_hit:
            hits += 1
            
    return schemas.UsageSummaryResponse(
        total_tokens_in=total_in,
        total_tokens_out=total_out,
        operations_count=ops_count,
        cache_hit_ratio=(hits / total) if total > 0 else 0.0
    )

@app.get("/usage/anomalies", dependencies=[Depends(get_current_user)])
async def get_usage_anomalies(tenant_id: str, db: AsyncSession = Depends(get_db)):
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - datetime.timedelta(days=7)
    
    # Fetch logs for the past 7 days and today
    query = select(models.AiUsageLog).where(
        models.AiUsageLog.tenant_id == tenant_id,
        models.AiUsageLog.created_at >= week_start
    )
    result = await db.execute(query)
    logs = result.scalars().all()
    
    today_count = 0
    past_7_days_count = 0
    for l in logs:
        if l.created_at >= today_start:
            today_count += 1
        else:
            past_7_days_count += 1
            
    avg_7day = past_7_days_count / 7.0 if past_7_days_count > 0 else 0
    threshold = float(os.environ.get("ANOMALY_THRESHOLD_MULTIPLIER", "3.0"))
    
    is_anomaly = today_count > (threshold * avg_7day) and avg_7day > 0
    
    return {
        "tenant_id": tenant_id,
        "today_calls": today_count,
        "avg_7day": avg_7day,
        "is_anomaly": is_anomaly
    }

@app.get("/usage/quota/check", response_model=schemas.QuotaCheckResponse, dependencies=[Depends(get_current_user)])
async def check_quota(tenant_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.TenantQuota).where(models.TenantQuota.tenant_id == tenant_id))
    quota = result.scalars().first()
    
    now = _utc_now()
    
    if not quota:
        # Create default quota for new tenant
        next_month = now + datetime.timedelta(days=30)
        quota = models.TenantQuota(
            tenant_id=tenant_id,
            plan="free",
            monthly_ai_calls_limit=100, # default free tier limit
            monthly_ai_calls_used=0,
            reset_at=next_month
        )
        db.add(quota)
        await db.commit()
        await db.refresh(quota)
        
    # Lazy reset
    if now > _as_aware_utc(quota.reset_at):
        quota.monthly_ai_calls_used = 0
        quota.reset_at = now + datetime.timedelta(days=30)
        await db.commit()
        await db.refresh(quota)
        
    return schemas.QuotaCheckResponse(
        tenant_id=tenant_id,
        plan=quota.plan,
        limit=quota.monthly_ai_calls_limit,
        used=quota.monthly_ai_calls_used,
        remaining=max(0, quota.monthly_ai_calls_limit - quota.monthly_ai_calls_used),
        reset_at=quota.reset_at,
        quota_exceeded=quota.monthly_ai_calls_used >= quota.monthly_ai_calls_limit
    )

@app.post("/reports/morning/{project_id}/generate", response_model=schemas.MorningReportResponse, dependencies=[Depends(get_current_user)])
async def generate_morning_report_endpoint(project_id: str, db: AsyncSession = Depends(get_db)):
    from paax_db.report_generator import generate_report
    try:
        report_data = await generate_report(project_id, db)
        db_report = models.MorningReport(**report_data.model_dump())
        db.add(db_report)
        await db.commit()
        await db.refresh(db_report)
        return db_report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
        
@app.get("/reports/morning/{project_id}", response_model=List[schemas.MorningReportResponse], dependencies=[Depends(get_current_user)])
async def list_morning_reports(project_id: str, limit: int = 10, db: AsyncSession = Depends(get_db)):
    query = select(models.MorningReport).where(models.MorningReport.project_id == project_id).order_by(models.MorningReport.generated_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

# ─── Command Room memory layer (Fase 4, PLAN.md §5/§9) ─────────────────────
# Source of truth server-side untuk conversations/messages/durable_memories.
# apps/web/src/lib/chat/chat-history.ts (localStorage) tetap dipertahankan
# sbg cache/offline fallback selama migrasi dua-arah (PLAN.md §8.3) -- endpoint
# ini TIDAK otomatis menggantikannya, itu keputusan sinkronisasi terpisah.

@app.post("/conversations", response_model=schemas.ConversationResponse, dependencies=[Depends(get_current_user)])
async def create_conversation(conv: schemas.ConversationCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    db_conv = models.Conversation(
        project_id=conv.project_id,
        user_id=user.uid,
        model_alias=conv.model_alias,
        title=conv.title,
    )
    db.add(db_conv)
    await db.commit()
    await db.refresh(db_conv)
    return db_conv

@app.get("/conversations", response_model=List[schemas.ConversationResponse], dependencies=[Depends(get_current_user)])
async def list_conversations(project_id: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(models.Conversation).where(models.Conversation.user_id == user.uid)
    if project_id:
        query = query.where(models.Conversation.project_id == project_id)
    query = query.order_by(models.Conversation.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@app.get("/conversations/{id}", response_model=schemas.ConversationResponse, dependencies=[Depends(get_current_user)])
async def get_conversation(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Conversation).where(models.Conversation.id == id))
    conv = result.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@app.put("/conversations/{id}", response_model=schemas.ConversationResponse, dependencies=[Depends(get_current_user)])
async def update_conversation(id: str, update: schemas.ConversationUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Conversation).where(models.Conversation.id == id))
    conv = result.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(conv, key, value)
    await db.commit()
    await db.refresh(conv)
    return conv

@app.delete("/conversations/{id}", dependencies=[Depends(get_current_user)])
async def delete_conversation(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Conversation).where(models.Conversation.id == id))
    conv = result.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()
    return {"status": "success"}

@app.post("/conversations/{id}/messages", response_model=schemas.MessageResponse, dependencies=[Depends(get_current_user)])
async def append_message(id: str, message: schemas.MessageCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Conversation).where(models.Conversation.id == id))
    conv = result.scalars().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db_message = models.Message(conversation_id=id, **message.model_dump())
    db.add(db_message)
    conv.updated_at = _utc_now()
    await db.commit()
    await db.refresh(db_message)
    return db_message

@app.get("/conversations/{id}/messages", response_model=List[schemas.MessageResponse], dependencies=[Depends(get_current_user)])
async def list_messages(id: str, db: AsyncSession = Depends(get_db)):
    query = select(models.Message).where(models.Message.conversation_id == id).order_by(models.Message.sequence.asc())
    result = await db.execute(query)
    return result.scalars().all()

@app.post("/memory/durable", response_model=schemas.DurableMemoryResponse, dependencies=[Depends(get_current_user)])
async def create_durable_memory(memory: schemas.DurableMemoryCreate, db: AsyncSession = Depends(get_db)):
    if memory.scope not in schemas.DURABLE_MEMORY_SCOPES:
        raise HTTPException(status_code=400, detail=f"scope tidak valid: {memory.scope}")
    if memory.type not in schemas.DURABLE_MEMORY_TYPES:
        raise HTTPException(status_code=400, detail=f"type tidak valid: {memory.type}")
    # Model output is never authority for a durable project fact. Only immutable
    # evidence, Project Graph evidence, or an explicitly approved correction may
    # become a project-scoped fact.
    if memory.scope == "project" and memory.type == "fact" and memory.source_type not in {"evidence", "project_graph", "approved_correction"}:
        raise HTTPException(status_code=400, detail="project fact harus berasal dari evidence atau approved_correction")

    # Kalau memory ini menggantikan memory lama (supersedes), tandai yang lama
    # superseded -- jangan pernah diam-diam menimpa tanpa jejak (blueprint §9.5).
    if memory.supersedes:
        old_result = await db.execute(select(models.DurableMemory).where(models.DurableMemory.id == memory.supersedes))
        old_memory = old_result.scalars().first()
        if old_memory:
            old_memory.status = "superseded"

    db_memory = models.DurableMemory(**memory.model_dump())
    db.add(db_memory)
    await db.commit()
    await db.refresh(db_memory)
    return db_memory

@app.get("/memory/durable", response_model=List[schemas.DurableMemoryResponse], dependencies=[Depends(get_current_user)])
async def list_durable_memories(
    scope: str | None = None,
    scope_ref_id: str | None = None,
    status: str = "active",
    db: AsyncSession = Depends(get_db),
):
    query = select(models.DurableMemory)
    if scope:
        query = query.where(models.DurableMemory.scope == scope)
    if scope_ref_id:
        query = query.where(models.DurableMemory.scope_ref_id == scope_ref_id)
    if status:
        query = query.where(models.DurableMemory.status == status)
    query = query.order_by(models.DurableMemory.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@app.get(
    "/projects/{id}/dem/sheets",
    response_model=List[schemas.ProjectDemSheetResponse],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def list_project_dem_sheets(id: str, db: AsyncSession = Depends(get_db)):
    query = (
        select(models.DemRun, models.DemPage)
        .join(models.DemPage, models.DemRun.id == models.DemPage.run_id)
        .where(models.DemRun.project_id == id)
        .order_by(models.DemRun.created_at.desc(), models.DemPage.page_index.asc())
    )
    result = await db.execute(query)
    rows = result.all()
    
    sheets = []
    for run, page in rows:
        sheet_title = None
        if page.result:
            sheet_identity = page.result.get("sheet_identity") or {}
            title_obj = sheet_identity.get("title") or {}
            sheet_title = title_obj.get("value")
            
        sheets.append(schemas.ProjectDemSheetResponse(
            run_id=str(run.id),
            page_index=page.page_index,
            file_name=run.file_name,
            status=page.status,
            sheet_title=sheet_title,
            thumbnail_url=f"/drawings/dem/{run.id}/pages/{page.page_index}/image"
        ))
    return sheets


@app.get(
    "/projects/{id}/dem/runs",
    response_model=List[schemas.DemRunResponse],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def list_project_dem_runs(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.DemRun)
        .where(models.DemRun.project_id == id)
        .order_by(models.DemRun.created_at.desc())
    )
    return result.scalars().all()


@app.post("/dem/runs", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def create_dem_run(run: schemas.DemRunCreate, db: AsyncSession = Depends(get_db)):
    db_run = models.DemRun(**run.model_dump())
    db.add(db_run)
    await db.commit()
    await db.refresh(db_run)
    return db_run


@app.get("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    return run


@app.put("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def update_dem_run(id: str, update: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    for key, value in update.items():
        if hasattr(run, key):
            setattr(run, key, value)
    await db.commit()
    await db.refresh(run)
    return run


@app.get("/dem/runs/{id}/status", response_model=schemas.DemRunStatusResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run_status(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    pages_result = await db.execute(
        select(models.DemPage).where(models.DemPage.run_id == id).order_by(models.DemPage.page_index)
    )
    pages = pages_result.scalars().all()
    return schemas.DemRunStatusResponse(
        id=run.id,
        status=run.status,
        total_pages=run.total_pages,
        pages=pages,
    )


@app.post("/dem/pages", response_model=schemas.DemPageResponse, dependencies=[Depends(get_current_user)])
async def create_dem_page(run_id: str, page_index: int, db: AsyncSession = Depends(get_db)):
    db_page = models.DemPage(run_id=run_id, page_index=page_index)
    db.add(db_page)
    await db.commit()
    await db.refresh(db_page)
    return db_page


@app.put("/dem/pages/{id}", response_model=schemas.DemPageResponse, dependencies=[Depends(get_current_user)])
async def update_dem_page(id: str, update: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.DemPage).where(models.DemPage.id == id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="DEM page not found")
    for key, value in update.items():
        if hasattr(page, key):
            setattr(page, key, value)
    await db.commit()
    await db.refresh(page)
    return page

@app.post(
    "/projects/{id}/project-graph/snapshots",
    response_model=schemas.ProjectGraphSnapshotResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def build_project_graph_snapshot(
    id: str,
    request: schemas.ProjectGraphSnapshotBuildRequest,
    db: AsyncSession = Depends(get_db),
):
    project = (await db.execute(select(models.Project).where(models.Project.id == id))).scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    snapshot = await build_and_activate_snapshot(
        db,
        project_id=id,
        snapshot_id=request.snapshot_id,
        schema_version=request.schema_version,
        source_manifest_hash=request.source_manifest_hash,
        generation_metadata=request.generation_metadata,
        effective_sheet_revision_ids=request.effective_sheet_revision_ids,
        nodes=request.nodes,
        edges=request.edges,
        evidence=request.evidence,
        node_evidence=request.node_evidence,
        edge_evidence=request.edge_evidence,
        aliases=request.aliases,
        communities=request.communities,
        summary_views=request.summary_views,
    )
    await db.commit()
    return snapshot



@app.get(
    "/projects/{id}/project-graph/snapshot",
    response_model=schemas.ProjectGraphSnapshotResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def read_active_project_graph_snapshot(id: str, db: AsyncSession = Depends(get_db)):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Project graph is not ready")
    return snapshot


@app.post(
    "/projects/{id}/project-graph/retrieve",
    response_model=schemas.ProjectGraphRetrievalResponse,
    response_model_exclude_unset=True,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def retrieve_active_project_graph(
    id: str, request: schemas.ProjectGraphRetrievalRequest, db: AsyncSession = Depends(get_db)
):
    limit = int(os.getenv("PCKM_RETRIEVAL_LIMIT_PER_MINUTE", "60"))
    window_start = _utc_now() - datetime.timedelta(minutes=1)
    recent_queries = (await db.execute(select(models.ProjectGraphQueryLog.id).where(
        models.ProjectGraphQueryLog.project_id == id,
        models.ProjectGraphQueryLog.created_at >= window_start,
    ))).all()
    if len(recent_queries) >= limit:
        raise HTTPException(status_code=429, detail="Project graph retrieval rate limit exceeded")
    snapshot = await get_active_snapshot(db, id)
    cache_key = hashlib.sha256(json.dumps({"project": id, "snapshot": snapshot.snapshot_id if snapshot else None, "request": request.model_dump()}, sort_keys=True).encode()).hexdigest()
    cached = await db.get(models.ProjectGraphRetrievalCache, cache_key)
    if cached and _as_aware_utc(cached.expires_at) > _utc_now():
        return cached.payload
    result = await retrieve_project_graph(
        db, project_id=id, query=request.query, depth=request.depth,
        budget_tokens=request.budget_tokens, relations=set(request.relations),
        traversal_mode=request.traversal_mode, target_node_id=request.target_node_id,
        use_intent=request.use_intent,
    )
    await db.commit()
    response = {
        "status": result.status,
        "snapshot_id": result.snapshot_id,
        "nodes": [{"node_id": node.node_id, "type": node.node_type,
                   "name": getattr(node, "_paax_correction_name", node.canonical_name),
                   "discipline": node.discipline, "confidence": float(node.confidence),
                   "properties_json": node.properties_json,
                   **({"data_status": "corrected", "correction": node._paax_correction_overlay}
                      if hasattr(node, "_paax_correction_overlay") else {})} for node in result.nodes],
        "edges": [{"edge_id": edge.edge_id, "source": edge.source_node_id, "target": edge.target_node_id,
                   "relation": edge.relation, "confidence": float(edge.confidence),
                   **({"data_status": "corrected", "correction": edge._paax_correction_overlay}
                      if hasattr(edge, "_paax_correction_overlay") else {})} for edge in result.edges],
        "evidence": [{"evidence_id": item.evidence_id, "document_id": item.document_id,
                      "sheet_id": item.sheet_id, "page_index": item.page_index, "raw_text": item.raw_text}
                     for item in result.evidence],
        "context_token_estimate": result.context_token_estimate,
    }
    if result.snapshot_id is not None and (request.use_intent or result.data_status == "corrected" or result.intent is not None):
        response.update({
            "intent": result.intent,
            "applied_filters": result.applied_filters,
            "data_status": result.data_status,
            "notes": result.notes,
            "summary_view": result.summary_view,
            "guidance": result.guidance,
            "rab_bridge_available": result.rab_bridge_available,
            "missing_information": result.missing_information,
            "facts": result.facts,
            "relationships": result.relationships,
            "conflicts": result.conflicts,
            "citations": result.citations,
            "allowed_claims": result.allowed_claims,
            "forbidden_claims": result.forbidden_claims,
            "quantity_authority": result.quantity_authority,
        })
    if result.snapshot_id:
        await db.merge(models.ProjectGraphRetrievalCache(cache_key=cache_key, project_id=id, snapshot_id=result.snapshot_id, payload=response, expires_at=_utc_now() + datetime.timedelta(seconds=int(os.getenv("PCKM_RETRIEVAL_CACHE_SECONDS", "300")))))
        await db.commit()
    return response


@app.get(
    "/projects/{id}/project-graph/metrics",
    response_model=schemas.ProjectGraphMetricsResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def get_project_graph_metrics(id: str, db: AsyncSession = Depends(get_db)):
    logs = (await db.execute(select(models.ProjectGraphQueryLog).where(
        models.ProjectGraphQueryLog.project_id == id,
    ))).scalars().all()
    count = len(logs)
    return {
        "project_id": id,
        "query_count": count,
        "success_count": sum(log.outcome == "success" for log in logs),
        "not_ready_count": sum(log.outcome == "not_ready" for log in logs),
        "average_context_tokens": (sum(log.context_token_estimate for log in logs) / count) if count else 0.0,
    }


@app.post(
    "/projects/{id}/project-graph/corrections",
    response_model=schemas.ProjectGraphCorrectionResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def create_project_graph_correction(
    id: str, request: schemas.ProjectGraphCorrectionCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None or snapshot.snapshot_id != request.snapshot_id:
        raise HTTPException(status_code=409, detail="Correction must target the active project graph snapshot")
    correction = models.ProjectGraphCorrection(project_id=id, status="pending", created_by=user.uid, **request.model_dump())
    db.add(correction)
    await db.commit()
    return correction


@app.post(
    "/projects/{id}/project-graph/corrections/{correction_id}/resolve",
    response_model=schemas.ProjectGraphCorrectionResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def resolve_project_graph_correction(
    id: str, correction_id: str, request: schemas.ProjectGraphCorrectionResolve, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    correction = (await db.execute(select(models.ProjectGraphCorrection).where(
        models.ProjectGraphCorrection.id == correction_id,
        models.ProjectGraphCorrection.project_id == id,
        models.ProjectGraphCorrection.status == "pending",
    ))).scalars().first()
    if correction is None:
        raise HTTPException(status_code=404, detail="Pending graph correction not found")
    correction.status = request.status
    correction.resolution_note = request.resolution_note
    correction.resolved_by = user.uid
    correction.resolved_at = _utc_now()
    await db.execute(delete(models.ProjectGraphRetrievalCache).where(
        models.ProjectGraphRetrievalCache.project_id == id,
        models.ProjectGraphRetrievalCache.snapshot_id == correction.snapshot_id,
    ))
    await db.commit()
    return correction


@app.post(
    "/projects/{id}/project-graph/rab-bridge",
    response_model=schemas.RabBridgeResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def create_rab_bridge_proposal(
    id: str, request: schemas.RabBridgeRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    proposal = await build_rab_bridge_proposal(db, project_id=id, node_ids=request.node_ids, created_by=user.uid)
    await db.commit()
    return proposal


@app.get(
    "/projects/{id}/project-graph/rab-bridge/proposals",
    response_model=List[schemas.RabBridgeProposalSummary],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def list_rab_bridge_proposals(
    id: str,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """SS5.2.1 — List proposals RAB Bridge untuk proyek, opsional filter by status.
    Dipakai oleh halaman RAB untuk menampilkan proposals yang siap dimateriailsasi.
    """
    query = select(models.RabBridgeProposal).where(
        models.RabBridgeProposal.project_id == id
    ).order_by(models.RabBridgeProposal.created_at.desc())
    if status:
        query = query.where(models.RabBridgeProposal.status == status)
    res = await db.execute(query)
    proposals = res.scalars().all()
    return [
        schemas.RabBridgeProposalSummary(
            proposal_id=p.id,
            snapshot_id=p.snapshot_id,
            status=p.status,
            item_count=len(p.payload.get("items", [])) if p.payload else 0,
            created_at=p.created_at,
            reviewed_at=p.reviewed_at,
        )
        for p in proposals
    ]


@app.get(
    "/projects/{id}/project-graph/review-queue",
    response_model=schemas.ProjectGraphReviewQueueResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def get_project_graph_review_queue(id: str, db: AsyncSession = Depends(get_db)):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        return {"project_id": id, "snapshot_id": "", "items": [], "summary": {"total": 0, "by_reason": {}}}
    return await build_review_queue(db, project_id=id, snapshot_id=snapshot.snapshot_id)


@app.get(
    "/projects/{id}/project-graph/quantity-readiness",
    response_model=schemas.QuantityReadinessResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def get_quantity_readiness(id: str, db: AsyncSession = Depends(get_db)):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        return {"project_id": id, "snapshot_id": "", "items": [], "summary": {"total": 0, "ready": 0, "needs_review": 0, "blocked": 0}}
    return await build_quantity_readiness(db, project_id=id, snapshot_id=snapshot.snapshot_id)


@app.post(
    "/projects/{id}/project-graph/rab-bridge/{proposal_id}/resolve",
    response_model=schemas.RabBridgeResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def resolve_rab_bridge_proposal(id: str, proposal_id: str, request: schemas.RabBridgeProposalResolve, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    proposal = (await db.execute(select(models.RabBridgeProposal).where(
        models.RabBridgeProposal.id == proposal_id,
        models.RabBridgeProposal.project_id == id,
        models.RabBridgeProposal.status == "pending",
    ))).scalars().first()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Pending RAB bridge proposal not found")
    proposal.status = request.status
    proposal.reviewed_by = user.uid
    proposal.reviewed_at = _utc_now()
    await db.commit()
    return {"status": proposal.status, "snapshot_id": proposal.snapshot_id, "proposal_id": proposal.id, "items": proposal.payload.get("items", [])}


import sys
from pathlib import Path
core_engine_path = str(Path(__file__).resolve().parents[3] / "core-engine")
if core_engine_path not in sys.path:
    sys.path.append(core_engine_path)

try:
    from app.rab.suggest import suggest_ahsp_for_node
    from app.rab.geometry import compute_volume
except ImportError as e:
    print("IMPORT ERROR:", e)
    def suggest_ahsp_for_node(name, discipline): return None, 0.25
    def compute_volume(dims): return None

@app.post(
    "/projects/{id}/project-graph/rab-bridge/{proposal_id}/materialize",
    response_model=schemas.RabBridgeMaterializeResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def materialize_rab_bridge_proposal(
    id: str, proposal_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    import uuid
    proposal_res = await db.execute(select(models.RabBridgeProposal).where(
        models.RabBridgeProposal.id == proposal_id,
        models.RabBridgeProposal.project_id == id
    ))
    proposal = proposal_res.scalars().first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
        
    if proposal.status != "approved":
        raise HTTPException(status_code=400, detail="Proposal must be approved before materialization")

    items = proposal.payload.get("items", [])
    materialized_count = 0
    skipped_items = []
    new_lines = []

    all_evidence_ids = []
    for item in items:
        all_evidence_ids.extend(item.get("evidence_ids", []))
        
    evidence_map = {}
    if all_evidence_ids:
        ev_res = await db.execute(select(models.ProjectGraphEvidence).where(
            models.ProjectGraphEvidence.snapshot_id == proposal.snapshot_id,
            models.ProjectGraphEvidence.evidence_id.in_(all_evidence_ids)
        ))
        for ev_obj in ev_res.scalars().all():
            evidence_map[ev_obj.evidence_id] = {
                "sheet_id": ev_obj.sheet_id,
                "page_index": ev_obj.page_index
            }

    for item in items:
        node_id = item.get("node_id", "")
        name = item.get("name", "")
        discipline = item.get("discipline", "")
        properties = item.get("properties", {})
        evidence_ids = item.get("evidence_ids", [])
        
        ahsp_code, confidence = suggest_ahsp_for_node(name, discipline)
        
        volume = None
        volume_source = None
        assumption_id = None
        
        stored_facts = properties.get("stored_measurement_facts", [])
        if stored_facts:
            dims_dict = {}
            for fact in stored_facts:
                if isinstance(fact, dict) and "name" in fact and "value" in fact:
                    dims_dict[fact["name"]] = fact["value"]
            volume = compute_volume(dims_dict)
            if volume is not None:
                volume_source = "written_dimension"
        
        if volume is None:
            element_type_id = properties.get("element_type_id")
            if element_type_id:
                assumption_res = await db.execute(select(models.QuantityAssumption).where(
                    models.QuantityAssumption.project_id == id,
                    models.QuantityAssumption.element_type_id == element_type_id,
                    models.QuantityAssumption.status == "accepted"
                ))
                assumption = assumption_res.scalars().first()
                if assumption:
                    volume = compute_volume(assumption.text)
                    if volume is not None:
                        volume_source = "human_assumption"
                        assumption_id = assumption.id

        if volume is None:
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="blocked_missing_dimension"))
            continue
            
        if not ahsp_code:
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="missing_ahsp_code"))
            continue

        line = {
            "id": str(uuid.uuid4()),
            "ahsp_code": ahsp_code,
            "volume": volume,
            "duration_days": None,
            "ahsp_suggested": True,
            "volume_source": volume_source,
            "evidence_ids": evidence_ids,
            # SS5.2.1 — label sumber agar user tahu baris ini berasal dari RAB Bridge
            "source": "rab_bridge",
        }
        if assumption_id:
            line["assumption_id"] = assumption_id
        if evidence_ids and evidence_ids[0] in evidence_map:
            line["sheet_id"] = evidence_map[evidence_ids[0]]["sheet_id"]
            line["page_index"] = evidence_map[evidence_ids[0]]["page_index"]
            
        new_lines.append(line)
        materialized_count += 1
        
    rab_draft_updated = False
    if new_lines:
        rab_res = await db.execute(select(models.RabDraft).where(models.RabDraft.project_id == id))
        db_rab = rab_res.scalars().first()
        
        if db_rab and db_rab.payload:
            payload = db_rab.payload
            if "lines" not in payload:
                payload["lines"] = []
            payload["lines"].extend(new_lines)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(db_rab, "payload")
        else:
            payload = {
                "projectId": id,
                "regionCode": "jateng",
                "ppnRate": 0.11,
                "mode": "sequential",
                "lines": new_lines,
                "lastTotal": None,
                "lastCalculatedAt": None,
                "updatedAt": _utc_now().isoformat()
            }
            if db_rab:
                db_rab.payload = payload
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(db_rab, "payload")
            else:
                db_rab = models.RabDraft(project_id=id, payload=payload)
                db.add(db_rab)
                
        rab_draft_updated = True
        
    proposal.status = "materialized"
    await db.commit()
    
    return schemas.RabBridgeMaterializeResponse(
        materialized_count=materialized_count,
        skipped_items=skipped_items,
        rab_draft_updated=rab_draft_updated
    )


@app.get(
    "/projects/{id}/project-graph/summary-views",
    response_model=List[schemas.ProjectGraphSummaryViewResponse],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def get_project_graph_summary_views(    id: str,
    view_kind: Optional[str] = None,
    level_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        return []

    query = select(models.ProjectGraphSummaryView).where(
        models.ProjectGraphSummaryView.project_id == id,
        models.ProjectGraphSummaryView.snapshot_id == snapshot.snapshot_id,
    )
    if view_kind:
        query = query.where(models.ProjectGraphSummaryView.view_kind == view_kind)
    if level_id:
        query = query.where(models.ProjectGraphSummaryView.level_id == level_id)

    result = await db.execute(query)
    views = result.scalars().all()
    response = []
    overlays = await active_correction_overlays(db, project_id=id, snapshot_id=snapshot.snapshot_id)
    for view in views:
        payload = schemas.ProjectGraphSummaryView.model_validate(view.payload).model_dump(mode="json")
        corrections = []
        for target_id, correction in overlays.items():
            for entry in payload["summary"]["element_type_index"]:
                if entry["element_type_id"] == target_id:
                    entry["data_status"] = "corrected"
                    entry["correction"] = correction
                    proposed = correction.get("proposed_value") or {}
                    if proposed.get("canonical_name"):
                        entry["name"] = proposed["canonical_name"]
                    corrections.append(correction)
        if corrections:
            payload["summary"]["data_status"] = "corrected"
            payload["summary"]["corrections"] = corrections
            payload["data_status"] = "corrected"
        if OCCURRENCE_CARDINALITY_NOTE not in payload["notes"]:
            payload["notes"].append(OCCURRENCE_CARDINALITY_NOTE)
        response.append({
        "snapshot_id": view.snapshot_id,
            "view_id": view.view_id,
            "project_id": view.project_id,
            "view_kind": view.view_kind,
            "level_id": view.level_id,
            "payload": payload,
        "created_at": view.created_at,
        })
    return response


@app.post(
    "/projects/{id}/project-graph/quantity-assumptions",
    response_model=schemas.QuantityAssumptionResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def create_quantity_assumption(
    id: str, request: schemas.QuantityAssumptionCreate, db: AsyncSession = Depends(get_db)
):
    """Buat asumsi kuantitas baru untuk proyek. Endpoint ini HANYA menyimpan teks asumsi manusia
    dan statusnya — tidak pernah menghitung angka apa pun (Aturan Emas)."""
    if request.project_id != id:
        raise HTTPException(status_code=400, detail="project_id di body tidak cocok dengan project id di path")
    existing = await db.get(models.QuantityAssumption, request.id)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Quantity assumption with this ID already exists")
    assumption = models.QuantityAssumption(**request.model_dump())
    db.add(assumption)
    await db.commit()
    await db.refresh(assumption)
    return assumption


@app.get(
    "/projects/{id}/project-graph/quantity-assumptions",
    response_model=List[schemas.QuantityAssumptionResponse],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def list_quantity_assumptions(
    id: str,
    element_type_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List semua asumsi kuantitas untuk proyek. Opsional filter by element_type_id."""
    query = select(models.QuantityAssumption).where(
        models.QuantityAssumption.project_id == id,
    )
    if element_type_id is not None:
        query = query.where(models.QuantityAssumption.element_type_id == element_type_id)
    result = await db.execute(query)
    return result.scalars().all()


@app.post(
    "/projects/{id}/project-graph/quantity-assumptions/{assumption_id}/resolve",
    response_model=schemas.QuantityAssumptionResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def resolve_quantity_assumption(
    id: str,
    assumption_id: str,
    request: schemas.QuantityAssumptionResolve,
    db: AsyncSession = Depends(get_db),
):
    """Ubah status asumsi kuantitas (accepted/rejected). Sesuai D12: approval SELALU aksi
    manusia eksplisit — tidak ada auto-accept. Hanya owner dan pm yang bisa menyetujui."""
    assumption = (await db.execute(
        select(models.QuantityAssumption).where(
            models.QuantityAssumption.id == assumption_id,
            models.QuantityAssumption.project_id == id,
        )
    )).scalars().first()
    if assumption is None:
        raise HTTPException(status_code=404, detail="Quantity assumption not found")
    assumption.status = request.status
    await db.commit()
    await db.refresh(assumption)
    return assumption


if __name__ == "__main__":

    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("paax_db.main:app", host="0.0.0.0", port=port, reload=True)
