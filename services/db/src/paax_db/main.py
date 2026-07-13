import os
import datetime
from typing import List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from . import models, schemas
from .database import get_db
from .auth import get_current_user, RoleChecker, User

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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("paax_db.main:app", host="0.0.0.0", port=port, reload=True)
