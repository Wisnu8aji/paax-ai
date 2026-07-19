import os
import datetime
import hashlib
import json
import re
from typing import List, Dict, Any, Optional
from sqlalchemy import delete, or_
import uuid
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from . import models, schemas
from .database import get_db
from .auth import get_current_user, require_project_access, RoleChecker, User
from .project_graph_repository import build_and_activate_snapshot, get_active_snapshot
from .models import SheetRevision
from .project_graph_retrieval import OCCURRENCE_CARDINALITY_NOTE, retrieve_project_graph
from .project_graph_rab_bridge import build_rab_bridge_proposal
from .project_graph_review import active_correction_overlays, build_quantity_readiness, build_review_queue
from .core_engine_client import CoreEngineUnavailable
from .core_engine_factory import build_core_engine_client
from .rab_bridge_lifecycle import transition
from .usage_telemetry import emit_best_effort, usage_logger_from_env

app = FastAPI(title="PAAX DB API", description="Server-side persistent storage for PAAX AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_CORRELATION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SAFE_METADATA_KEY = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
_SENSITIVE_METADATA_TERMS = frozenset({
    "api_key", "authorization", "content", "credential", "document", "drawing",
    "password", "prompt", "secret", "text", "token",
})


def _safe_correlation_id(value: str | None) -> str:
    """Accept a bounded trace identifier or replace it; never echo unsafe input."""
    if value and _CORRELATION_ID_PATTERN.fullmatch(value):
        return value
    return str(uuid.uuid4())


def _redact_observability_metadata(value: Any, *, depth: int = 0) -> Any:
    """Keep only bounded numeric telemetry; raw text is intentionally discarded."""
    if depth > 4:
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, nested in list(value.items())[:64]:
            normalized = str(key).strip().lower()
            if (
                not _SAFE_METADATA_KEY.fullmatch(normalized)
                or any(term in normalized for term in _SENSITIVE_METADATA_TERMS)
            ):
                continue
            redacted = _redact_observability_metadata(nested, depth=depth + 1)
            if redacted is not None:
                clean[normalized] = redacted
        return clean
    if isinstance(value, (list, tuple)):
        clean_values = [_redact_observability_metadata(item, depth=depth + 1) for item in value[:64]]
        return [item for item in clean_values if item is not None]
    return None


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next: Any):
    correlation_id = _safe_correlation_id(request.headers.get("X-Correlation-Id"))
    request.state.correlation_id = correlation_id
    response = await call_next(request)
    response.headers["X-Correlation-Id"] = correlation_id
    return response


def get_core_engine_client() -> Any | None:
    """Explicit composition boundary; deployments must inject the authenticated client."""
    return getattr(app.state, "core_engine_client", None) or build_core_engine_client()


async def _approved_scoped_measurement_facts(
    db: AsyncSession, *, project_id: str, snapshot_id: str, measurement_fact_ids: list[str],
) -> list[models.MeasurementFact]:
    facts = (await db.execute(select(models.MeasurementFact).where(
        models.MeasurementFact.project_id == project_id,
        models.MeasurementFact.snapshot_id == snapshot_id,
        models.MeasurementFact.measurement_id.in_(measurement_fact_ids),
    ))).scalars().all()
    by_id = {fact.measurement_id: fact for fact in facts}
    if set(measurement_fact_ids) != set(by_id) or any(
        fact.verification_status not in {"human_verified", "engine_verified"} or fact.superseded_at is not None
        for fact in facts
    ):
        raise HTTPException(status_code=422, detail="mapping requires approved, non-superseded Measurement Facts scoped to this project snapshot")
    return [by_id[fact_id] for fact_id in measurement_fact_ids]


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _audit_project_action(db: AsyncSession, *, project_id: str, actor: str, action: str, target_id: str, success: bool = True) -> None:
    """Append-only, secret-free audit event for privileged project operations."""
    db.add(models.ToolCallAudit(
        session_id=actor, project_id=project_id, tool_name=action,
        tool_args={"target_id": target_id}, result_payload=None,
        success=success,
    ))


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
async def log_usage(log_data: schemas.AiUsageLogCreate, request: Request, db: AsyncSession = Depends(get_db)):
    """Persist safe telemetry only; this endpoint does not invoke any AI provider."""
    payload = log_data.model_dump()
    payload["correlation_id"] = payload["correlation_id"] or request.state.correlation_id
    payload["metadata_json"] = _redact_observability_metadata(payload.pop("metadata")) or {}
    db_log = models.AiUsageLog(**payload)
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
    return schemas.AiUsageLogResponse(
        **log_data.model_dump(exclude={"id", "metadata", "correlation_id"}),
        correlation_id=db_log.correlation_id,
        metadata=db_log.metadata_json,
        id=db_log.id,
        created_at=db_log.created_at,
    )

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

@app.get("/projects/{id}/observability", response_model=schemas.ProjectObservabilitySummary,
         dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))])
async def project_observability(id: str, days: int = 30, db: AsyncSession = Depends(get_db)):
    """Read only stored telemetry; never calls an AI provider or exposes event metadata."""
    days = max(1, min(days, 90))
    since = _utc_now() - datetime.timedelta(days=days)
    rows = (await db.execute(select(models.AiUsageLog).where(
        models.AiUsageLog.project_id == id, models.AiUsageLog.created_at >= since,
    ).order_by(models.AiUsageLog.created_at))).scalars().all()
    buckets: dict[str, dict[str, int]] = {}
    for row in rows:
        created = _as_aware_utc(row.created_at)
        key = created.date().isoformat()
        bucket = buckets.setdefault(key, {"event_count": 0, "error_count": 0, "tokens_in": 0, "tokens_out": 0, "cost_microunits": 0, "latency_ms_total": 0})
        bucket["event_count"] += 1
        bucket["error_count"] += int(not row.success)
        bucket["tokens_in"] += row.tokens_in or 0; bucket["tokens_out"] += row.tokens_out or 0
        bucket["cost_microunits"] += row.cost_microunits or 0; bucket["latency_ms_total"] += row.latency_ms or 0
    return {"project_id": id, "buckets": [{"bucket": key, **value} for key, value in sorted(buckets.items())]}

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
async def create_dem_run(run: schemas.DemRunCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await require_project_access(run.project_id, db, user, service_scope="dem:write")
    db_run = models.DemRun(**run.model_dump())
    db.add(db_run)
    await db.commit()
    await db.refresh(db_run)
    return db_run


@app.get("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:read")
    return run


@app.post("/internal/projects/{id}/artifact-access", dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))])
async def authorize_project_artifact(id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """DB is the sole authority for artifact project scope; keys are verified against a DEM run."""
    key = body.get("artifact_key")
    if not isinstance(key, str):
        raise HTTPException(status_code=400, detail="artifact key required")
    run = (await db.execute(select(models.DemRun).where(
        models.DemRun.project_id == id, models.DemRun.artifact_key == key,
    ))).scalars().first()
    if run is None:
        raise HTTPException(status_code=403, detail="artifact is not in this project")
    return {"authorized": True}


@app.post("/internal/projects/{id}/artifact-delete-access", dependencies=[Depends(RoleChecker(["owner"]))])
async def authorize_project_artifact_deletion(id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Deletion is owner-only and the DB verifies the object key belongs to this project."""
    key = body.get("artifact_key")
    if not isinstance(key, str):
        raise HTTPException(status_code=400, detail="artifact key required")
    run = (await db.execute(select(models.DemRun).where(
        models.DemRun.project_id == id, models.DemRun.artifact_key == key,
    ))).scalars().first()
    if run is None:
        raise HTTPException(status_code=403, detail="artifact is not in this project")
    return {"authorized": True}


@app.get("/dem/runs/{id}/artifact-retention", dependencies=[Depends(get_current_user)])
async def get_dem_artifact_retention(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = (await db.execute(select(models.DemRun).where(models.DemRun.id == id))).scalars().first()
    if run is None or not run.artifact_key:
        raise HTTPException(status_code=404, detail="artifact not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:read")
    return {"run_id": str(run.id), "artifact_key": run.artifact_key, "deleted_at": run.artifact_deleted_at, "deleted_by": run.artifact_deleted_by}


@app.post("/internal/dem/runs/{id}/artifact-deleted", dependencies=[Depends(get_current_user)])
async def mark_dem_artifact_deleted(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Persist an idempotent retention tombstone before object-store deletion."""
    run = (await db.execute(select(models.DemRun).where(models.DemRun.id == id))).scalars().first()
    if run is None or not run.project_id or not run.artifact_key:
        raise HTTPException(status_code=404, detail="artifact not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:delete")
    if run.artifact_deleted_at is None:
        run.artifact_deleted_at = _utc_now()
        run.artifact_deleted_by = user.uid
        _audit_project_action(db, project_id=run.project_id, actor=user.uid, action="dem.artifact.deleted", target_id=str(run.id))
        await db.commit()
    return {"run_id": str(run.id), "deleted_at": run.artifact_deleted_at, "deleted_by": run.artifact_deleted_by}


@app.put("/dem/runs/{id}", response_model=schemas.DemRunResponse, dependencies=[Depends(get_current_user)])
async def update_dem_run(id: str, update: schemas.DemRunUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:write")
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(run, key, value)
    await db.commit()
    await db.refresh(run)
    return run


@app.get("/dem/runs/{id}/status", response_model=schemas.DemRunStatusResponse, dependencies=[Depends(get_current_user)])
async def get_dem_run_status(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(models.DemRun).where(models.DemRun.id == id))
    run = result.scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:read")
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
async def create_dem_page(run_id: str, page_index: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = (await db.execute(select(models.DemRun).where(models.DemRun.id == run_id))).scalars().first()
    if not run:
        raise HTTPException(status_code=404, detail="DEM run not found")
    await require_project_access(run.project_id, db, user, service_scope="dem:write")
    db_page = models.DemPage(run_id=run_id, page_index=page_index)
    db.add(db_page)
    await db.commit()
    await db.refresh(db_page)
    return db_page


@app.put("/dem/pages/{id}", response_model=schemas.DemPageResponse, dependencies=[Depends(get_current_user)])
async def update_dem_page(id: str, update: schemas.DemPageUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(models.DemPage).where(models.DemPage.id == id))
    page = result.scalars().first()
    if not page:
        raise HTTPException(status_code=404, detail="DEM page not found")
    run = (await db.execute(select(models.DemRun).where(models.DemRun.id == page.run_id))).scalars().first()
    await require_project_access(run.project_id if run else None, db, user, service_scope="dem:write")
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(page, key, value)
    await db.commit()
    await db.refresh(page)
    return page

@app.get(
    "/projects/{id}/sheet-revisions/active",
    response_model=List[schemas.ActiveSheetRevisionResponse],
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"], service_scope="project_graph:synthesize"))],
)
async def list_active_sheet_revisions(id: str, db: AsyncSession = Depends(get_db)):
    """Expose the project's currently-effective sheet revisions so DEM synthesis
    can tag evidence with a real revision_id instead of guessing/omitting it."""
    result = await db.execute(
        select(SheetRevision).where(
            SheetRevision.project_id == id,
            SheetRevision.is_active.is_(True),
        ).order_by(SheetRevision.revision_id)
    )
    return result.scalars().all()


@app.post(
    "/projects/{id}/project-graph/snapshots",
    response_model=schemas.ProjectGraphSnapshotResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"], service_scope="project_graph:synthesize"))],
)
async def build_project_graph_snapshot(
    id: str,
    request: schemas.ProjectGraphSnapshotBuildRequest,
    http_request: Request,
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
        telemetry=usage_logger_from_env(),
        correlation_id=http_request.state.correlation_id,
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
    id: str, request: schemas.ProjectGraphRetrievalRequest, http_request: Request, db: AsyncSession = Depends(get_db)
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
        await emit_best_effort(usage_logger_from_env(), {
            "service": "db", "operation": "pckm.retrieval", "event_type": "pipeline_metric",
            "status": str(cached.payload.get("status", "success")), "success": True, "cache_hit": True,
            "metric_count": 1, "correlation_id": http_request.state.correlation_id, "project_id": id,
            "snapshot_id": snapshot.snapshot_id if snapshot else None,
            "metadata": {"seed_count": 0, "node_count": len(cached.payload.get("nodes", [])),
                         "context_token_estimate": int(cached.payload.get("context_token_estimate", 0)), "empty_result": 0},
        })
        return cached.payload
    result = await retrieve_project_graph(
        db, project_id=id, query=request.query, depth=request.depth,
        budget_tokens=request.budget_tokens, relations=set(request.relations),
        traversal_mode=request.traversal_mode, target_node_id=request.target_node_id,
        use_intent=request.use_intent, telemetry=usage_logger_from_env(),
        correlation_id=http_request.state.correlation_id,
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
    if request.correction_type not in schemas.CORRECTION_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported correction type")
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None or snapshot.snapshot_id != request.snapshot_id:
        raise HTTPException(status_code=409, detail="Correction must target the active project graph snapshot")
    correction = models.ProjectGraphCorrection(project_id=id, status="pending", created_by=user.uid, **request.model_dump())
    db.add(correction)
    _audit_project_action(db, project_id=id, actor=user.uid, action="project_graph.correction.created", target_id=correction.id)
    await db.commit()
    return correction


@app.post(
    "/projects/{id}/project-graph/corrections/{correction_id}/resolve",
    response_model=schemas.ProjectGraphCorrectionResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def resolve_project_graph_correction(
    id: str, correction_id: str, request: schemas.ProjectGraphCorrectionResolve, http_request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
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
    _audit_project_action(db, project_id=id, actor=user.uid, action=f"project_graph.correction.{request.status}", target_id=correction.id)
    await db.execute(delete(models.ProjectGraphRetrievalCache).where(
        models.ProjectGraphRetrievalCache.project_id == id,
        models.ProjectGraphRetrievalCache.snapshot_id == correction.snapshot_id,
    ))
    await db.commit()
    created_at = _as_aware_utc(correction.created_at) if correction.created_at else correction.resolved_at
    resolution_ms = max(0, int((correction.resolved_at - created_at).total_seconds() * 1000)) if created_at else 0
    await emit_best_effort(usage_logger_from_env(), {
        "service": "db", "operation": "pckm.review.correction", "event_type": "pipeline_metric",
        "status": correction.status, "success": correction.status == "accepted", "metric_count": 1,
        "correlation_id": http_request.state.correlation_id, "project_id": id, "snapshot_id": correction.snapshot_id,
        "metadata": {"accepted_count": int(correction.status == "accepted"), "stale_count": int(correction.status == "stale"), "resolution_ms": resolution_ms},
    })
    # Accepted corrections are immediately available as active overlays for this
    # immutable snapshot; clients must refresh retrieval/review state after cache
    # invalidation. A future snapshot rebuild consumes the durable record.
    return correction


@app.post(
    "/projects/{id}/project-graph/rab-bridge",
    response_model=schemas.RabBridgeResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
)
async def create_rab_bridge_proposal(
    id: str, request: schemas.RabBridgeRequest, http_request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    proposal = await build_rab_bridge_proposal(db, project_id=id, node_ids=request.node_ids, created_by=user.uid)
    await db.commit()
    await emit_best_effort(usage_logger_from_env(), {
        "service": "db", "operation": "rab.proposal", "event_type": "pipeline_metric", "status": proposal.status,
        "success": proposal.status == "requires_human_approval", "metric_count": 1,
        "correlation_id": http_request.state.correlation_id, "project_id": id, "snapshot_id": proposal.snapshot_id,
        "metadata": {"proposal_count": 1, "blocked_count": int(proposal.status != "requires_human_approval"), "item_count": len(proposal.items)},
    })
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
async def get_project_graph_review_queue(id: str, http_request: Request, db: AsyncSession = Depends(get_db)):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        return {"project_id": id, "snapshot_id": "", "items": [], "summary": {"total": 0, "by_reason": {}}}
    queue = await build_review_queue(db, project_id=id, snapshot_id=snapshot.snapshot_id)
    await emit_best_effort(usage_logger_from_env(), {
        "service": "db", "operation": "pckm.review.queue", "event_type": "pipeline_metric",
        "status": "completed", "success": True, "metric_count": 1,
        "correlation_id": http_request.state.correlation_id, "project_id": id, "snapshot_id": snapshot.snapshot_id,
        "metadata": {"queue_size": int(queue["summary"]["total"])},
    })
    return queue


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
async def resolve_rab_bridge_proposal(id: str, proposal_id: str, request: schemas.RabBridgeProposalResolve, http_request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    proposal = (await db.execute(select(models.RabBridgeProposal).where(
        models.RabBridgeProposal.id == proposal_id,
        models.RabBridgeProposal.project_id == id,
        models.RabBridgeProposal.status.in_(["candidate_ready", "needs_review"]),
    ))).scalars().first()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Reviewable RAB bridge proposal not found")
    proposal.status = transition(proposal.status, request.status)
    proposal.reviewed_by = user.uid
    proposal.reviewed_at = _utc_now()
    _audit_project_action(db, project_id=id, actor=user.uid, action=f"rab_bridge.proposal.{request.status}", target_id=proposal.id)
    await db.commit()
    await emit_best_effort(usage_logger_from_env(), {
        "service": "db", "operation": "rab.ahsp.approval", "event_type": "pipeline_metric", "status": proposal.status,
        "success": proposal.status == "approved", "metric_count": 1,
        "correlation_id": http_request.state.correlation_id, "project_id": id, "snapshot_id": proposal.snapshot_id,
        "metadata": {"approved_selection_count": int(proposal.status == "approved")},
    })
    return {"status": proposal.status, "snapshot_id": proposal.snapshot_id, "proposal_id": proposal.id, "items": proposal.payload.get("items", [])}


@app.post(
    "/projects/{id}/project-graph/rab-materialization-mappings",
    response_model=schemas.RabMaterializationMappingResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "owner"]))],
)
async def create_rab_materialization_mapping(
    id: str, request: schemas.RabMaterializationMappingCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    snapshot = await get_active_snapshot(db, id)
    if snapshot is None:
        raise HTTPException(status_code=409, detail="active project graph snapshot is required before mapping")
    facts = await _approved_scoped_measurement_facts(
        db, project_id=id, snapshot_id=snapshot.snapshot_id, measurement_fact_ids=request.measurement_fact_ids,
    )

    mapping = models.RabMaterializationMapping(
        id=str(uuid.uuid4()), project_id=id, snapshot_id=snapshot.snapshot_id,
        work_item_node_id=request.work_item_node_id, measurement_fact_ids=request.measurement_fact_ids,
        calculation_type=request.calculation_type,
        evidence_refs=list(dict.fromkeys(ref for fact in facts for ref in fact.evidence_refs)),
        approval_status="pending_approval", created_by=user.uid,
    )
    db.add(mapping)
    db.add(models.RabMaterializationMappingAudit(
        mapping_id=mapping.id, action="created", actor=user.uid,
        metadata_json={"measurement_fact_ids": mapping.measurement_fact_ids, "evidence_refs": mapping.evidence_refs},
    ))
    await db.commit()
    await db.refresh(mapping)
    return mapping


@app.put(
    "/projects/{id}/project-graph/rab-materialization-mappings/{mapping_id}",
    response_model=schemas.RabMaterializationMappingResponse,
    dependencies=[Depends(RoleChecker(["estimator", "pm", "owner"]))],
)
async def update_rab_materialization_mapping(
    id: str, mapping_id: str, request: schemas.RabMaterializationMappingCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    mapping = (await db.execute(select(models.RabMaterializationMapping).where(
        models.RabMaterializationMapping.id == mapping_id, models.RabMaterializationMapping.project_id == id,
        models.RabMaterializationMapping.approval_status == "pending_approval",
    ))).scalars().first()
    if mapping is None:
        raise HTTPException(status_code=404, detail="pending RAB materialization mapping not found")
    facts = await _approved_scoped_measurement_facts(
        db, project_id=id, snapshot_id=mapping.snapshot_id, measurement_fact_ids=request.measurement_fact_ids,
    )
    mapping.work_item_node_id = request.work_item_node_id
    mapping.measurement_fact_ids = request.measurement_fact_ids
    mapping.calculation_type = request.calculation_type
    mapping.evidence_refs = list(dict.fromkeys(ref for fact in facts for ref in fact.evidence_refs))
    db.add(models.RabMaterializationMappingAudit(
        mapping_id=mapping.id, action="updated", actor=user.uid,
        metadata_json={"measurement_fact_ids": mapping.measurement_fact_ids, "evidence_refs": mapping.evidence_refs},
    ))
    await db.commit()
    await db.refresh(mapping)
    return mapping


@app.post("/durable-jobs/enqueue", dependencies=[Depends(get_current_user)])
async def enqueue_durable_job(body: dict, db: AsyncSession = Depends(get_db)):
    """Canonical idempotent queue insert. A unique key absorbs duplicate delivery."""
    key = body["idempotency_key"]
    existing = (await db.execute(select(models.DurableJob).where(models.DurableJob.idempotency_key == key))).scalars().first()
    if existing:
        return {"id": existing.id, "status": existing.status, "duplicate": True}
    job = models.DurableJob(id=str(uuid.uuid4()), job_type=body["job_type"], payload=body["payload"], idempotency_key=key, status="queued", attempt_count=0)
    db.add(job)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        existing = (await db.execute(select(models.DurableJob).where(models.DurableJob.idempotency_key == key))).scalars().one()
        return {"id": existing.id, "status": existing.status, "duplicate": True}
    return {"id": job.id, "status": job.status, "duplicate": False}


@app.post("/durable-jobs/lease", dependencies=[Depends(get_current_user)])
async def lease_durable_job(body: dict, db: AsyncSession = Depends(get_db)):
    """Atomically claim one due/expired job; SKIP LOCKED protects multi-instance workers."""
    now = _utc_now(); seconds = max(1, int(body.get("lease_seconds", 60)))
    stmt = (select(models.DurableJob).where(or_(
        models.DurableJob.status == "queued",
        (models.DurableJob.status == "retry_wait") & (models.DurableJob.next_attempt_at <= now),
        (models.DurableJob.status.in_(["leased", "running"])) & (models.DurableJob.lease_expires_at <= now),
    )).order_by(models.DurableJob.created_at).with_for_update(skip_locked=True).limit(1))
    job = (await db.execute(stmt)).scalars().first()
    if not job:
        return None
    if job.status in {"leased", "running"}:
        job.attempt_count += 1
    job.status, job.lease_owner = "leased", body["worker_id"]
    job.lease_expires_at = now + datetime.timedelta(seconds=seconds)
    await db.commit()
    return {"id": job.id, "job_type": job.job_type, "payload": job.payload, "attempt_count": job.attempt_count}


def _durable_job_or_404(job: models.DurableJob | None) -> models.DurableJob:
    if job is None:
        raise HTTPException(status_code=404, detail="durable job not found")
    return job


def _require_lease_owner(job: models.DurableJob, worker_id: str) -> None:
    if job.lease_owner and job.lease_owner != worker_id:
        raise HTTPException(status_code=409, detail="job lease belongs to another worker")


@app.post("/durable-jobs/{job_id}/transition", dependencies=[Depends(get_current_user)])
async def transition_durable_job(job_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Move a leased job to 'running'. A dedicated endpoint (rather than the
    generic patch pattern used elsewhere) keeps the durable-job state machine
    server-authoritative -- the worker states its intent, the DB enforces
    whether that transition is legal from the job's current status."""
    worker_id = body["worker_id"]
    job = _durable_job_or_404((await db.execute(
        select(models.DurableJob).where(models.DurableJob.id == job_id).with_for_update()
    )).scalars().first())
    _require_lease_owner(job, worker_id)
    if job.status not in {"leased", "running"}:
        raise HTTPException(status_code=409, detail=f"cannot transition to running from status '{job.status}'")
    job.status = "running"
    await db.commit()
    return {"id": job.id, "status": job.status}


@app.post("/durable-jobs/{job_id}/heartbeat", dependencies=[Depends(get_current_user)])
async def heartbeat_durable_job(job_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Extend a lease while a worker is actively processing a job -- without
    this, a slow (but healthy) job would have its lease expire and get
    re-leased to a second worker mid-processing."""
    worker_id = body["worker_id"]
    seconds = max(1, int(body.get("lease_seconds", 60)))
    job = _durable_job_or_404((await db.execute(
        select(models.DurableJob).where(models.DurableJob.id == job_id).with_for_update()
    )).scalars().first())
    if job.status not in {"leased", "running"} or job.lease_owner != worker_id:
        raise HTTPException(status_code=409, detail="cannot heartbeat a job not leased by this worker")
    job.lease_expires_at = _utc_now() + datetime.timedelta(seconds=seconds)
    await db.commit()
    return {"id": job.id, "lease_expires_at": job.lease_expires_at}


@app.post("/durable-jobs/{job_id}/complete", dependencies=[Depends(get_current_user)])
async def complete_durable_job(job_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    worker_id = body["worker_id"]
    job = _durable_job_or_404((await db.execute(
        select(models.DurableJob).where(models.DurableJob.id == job_id).with_for_update()
    )).scalars().first())
    _require_lease_owner(job, worker_id)
    if job.status != "running":
        raise HTTPException(status_code=409, detail=f"cannot complete a job in status '{job.status}'")
    job.status, job.lease_expires_at, job.lease_owner = "completed", None, None
    await db.commit()
    return {"id": job.id, "status": job.status}


@app.post("/durable-jobs/{job_id}/retry", dependencies=[Depends(get_current_user)])
async def retry_durable_job(job_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Bounded-retry transition matching InMemoryDurableJobStore.retry's
    policy: exponential backoff (1s/4s/16s pattern via 2**(attempt-1)) until
    max_attempts, then poisoned/failed -- so both queue backends behave
    identically to any caller."""
    worker_id, error = body["worker_id"], body.get("error", "")
    max_attempts = max(1, int(body.get("max_attempts", 3)))
    job = _durable_job_or_404((await db.execute(
        select(models.DurableJob).where(models.DurableJob.id == job_id).with_for_update()
    )).scalars().first())
    if job.status != "running" or job.lease_owner != worker_id:
        raise HTTPException(status_code=409, detail="only the lease owner can retry a running job")
    job.attempt_count += 1
    job.last_error = error
    job.lease_expires_at = None
    if job.attempt_count >= max_attempts:
        job.poisoned_at = _utc_now()
        job.status = "failed"
    else:
        job.status = "retry_wait"
        job.next_attempt_at = _utc_now() + datetime.timedelta(seconds=2 ** (job.attempt_count - 1))
    await db.commit()
    return {"id": job.id, "status": job.status, "attempt_count": job.attempt_count}


@app.get("/durable-jobs/{job_id}", dependencies=[Depends(get_current_user)])
async def get_durable_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = _durable_job_or_404((await db.execute(
        select(models.DurableJob).where(models.DurableJob.id == job_id)
    )).scalars().first())
    return {
        "id": job.id, "job_type": job.job_type, "payload": job.payload, "status": job.status,
        "lease_owner": job.lease_owner, "attempt_count": job.attempt_count, "last_error": job.last_error,
        "poisoned_at": job.poisoned_at,
    }


@app.post(
    "/projects/{id}/project-graph/rab-materialization-mappings/{mapping_id}/resolve",
    response_model=schemas.RabMaterializationMappingResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def resolve_rab_materialization_mapping(
    id: str, mapping_id: str, request: schemas.RabMaterializationMappingResolve, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    mapping = (await db.execute(select(models.RabMaterializationMapping).where(
        models.RabMaterializationMapping.id == mapping_id, models.RabMaterializationMapping.project_id == id,
        models.RabMaterializationMapping.approval_status == "pending_approval",
    ))).scalars().first()
    if mapping is None:
        raise HTTPException(status_code=404, detail="pending RAB materialization mapping not found")
    if request.status == "approved":
        await _approved_scoped_measurement_facts(
            db, project_id=id, snapshot_id=mapping.snapshot_id, measurement_fact_ids=list(mapping.measurement_fact_ids),
        )
    mapping.approval_status = request.status
    mapping.reviewed_by = user.uid
    mapping.reviewed_at = _utc_now()
    db.add(models.RabMaterializationMappingAudit(
        mapping_id=mapping.id, action=request.status, actor=user.uid,
        metadata_json={"measurement_fact_ids": mapping.measurement_fact_ids, "evidence_refs": mapping.evidence_refs},
    ))
    await db.commit()
    await db.refresh(mapping)
    return mapping


@app.post(
    "/projects/{id}/project-graph/rab-bridge/{proposal_id}/materialize",
    response_model=schemas.RabBridgeMaterializeResponse,
    dependencies=[Depends(RoleChecker(["owner", "pm"]))],
)
async def materialize_rab_bridge_proposal(
    id: str, proposal_id: str, http_request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
    core_engine_client: Any | None = Depends(get_core_engine_client),
):
    import uuid
    proposal_res = await db.execute(select(models.RabBridgeProposal).where(
        models.RabBridgeProposal.id == proposal_id,
        models.RabBridgeProposal.project_id == id
    ))
    proposal = proposal_res.scalars().first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    idempotency_key = http_request.headers.get("Idempotency-Key")
    if proposal.status == "materialized" and idempotency_key and proposal.materialization_key == idempotency_key:
        return schemas.RabBridgeMaterializeResponse(**proposal.materialization_result)
        
    if proposal.status != "approved":
        raise HTTPException(status_code=400, detail="Proposal must be approved before materialization")
    proposal.status = transition(proposal.status, "calculation_pending")

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
        evidence_ids = item.get("evidence_ids", [])
        
        ahsp_code = item.get("ahsp_code")
        mapping = (await db.execute(select(models.RabMaterializationMapping).where(
            models.RabMaterializationMapping.project_id == id,
            models.RabMaterializationMapping.snapshot_id == proposal.snapshot_id,
            models.RabMaterializationMapping.work_item_node_id == node_id,
            models.RabMaterializationMapping.approval_status == "approved",
        ))).scalars().first()
        if mapping is None:
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="blocked_missing_measurement_mapping"))
            continue
        if core_engine_client is None:
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="blocked_core_engine_client_unconfigured"))
            continue

        fact_ids = list(mapping.measurement_fact_ids or [])
        facts = (await db.execute(select(models.MeasurementFact).where(
            models.MeasurementFact.project_id == id,
            models.MeasurementFact.snapshot_id == proposal.snapshot_id,
            models.MeasurementFact.measurement_id.in_(fact_ids),
        ))).scalars().all() if fact_ids else []
        facts_by_id = {fact.measurement_id: fact for fact in facts}
        if set(fact_ids) != set(facts_by_id) or any(
            fact.verification_status not in {"human_verified", "engine_verified"} or fact.superseded_at is not None
            for fact in facts
        ):
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="blocked_unapproved_or_missing_measurement_fact"))
            continue
        request = {
            "project_id": id,
            "snapshot_id": proposal.snapshot_id,
            "measurement_fact_ids": fact_ids,
            "calculation_type": mapping.calculation_type,
            "requested_by": user.uid,
            "inputs": [{
                "measurement_id": fact.measurement_id, "project_id": fact.project_id, "snapshot_id": fact.snapshot_id,
                "measurement_type": fact.measurement_type, "value": str(fact.value), "unit": fact.unit,
                "source_method": fact.source_method, "element_ids": fact.element_ids, "evidence_refs": fact.evidence_refs,
                "formula_inputs": fact.formula_inputs, "verification_status": fact.verification_status,
                "created_by": fact.created_by, "audit_metadata": fact.audit_metadata,
                "supersedes_measurement_id": fact.supersedes_measurement_id,
            } for fact in (facts_by_id[fact_id] for fact_id in fact_ids)],
        }
        try:
            calculation = core_engine_client.calculate(request)
        except CoreEngineUnavailable:
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason="blocked_core_engine_unavailable"))
            continue
        if calculation.get("status") != "complete" or calculation.get("result") is None or not calculation.get("unit"):
            skipped_items.append(schemas.SkippedItem(node_id=node_id, reason=f"blocked_core_engine_{calculation.get('status', 'invalid_response')}"))
            continue

        volume = calculation["result"]
        volume_source = "core_engine_typed_measurements"
            
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
        line["measurement_mapping_id"] = mapping.id
        line["measurement_fact_ids"] = fact_ids
        line["calculation_id"] = calculation.get("calculation_id")
        line["calculation_status"] = calculation["status"]
        line["calculation_formula"] = calculation.get("formula")
        line["calculation_substituted_formula"] = calculation.get("substituted_formula")
        line["calculation_input_sources"] = calculation.get("input_sources", [])
        line["calculation_engine_version"] = calculation.get("engine_version")
        line["calculation_warnings"] = calculation.get("warnings", [])
        line["mapping_evidence_refs"] = mapping.evidence_refs
        line["ahsp_selection_approved"] = True
        line["ahsp_approved_by"] = proposal.reviewed_by
        line["ahsp_approved_at"] = proposal.reviewed_at.isoformat() if proposal.reviewed_at else None
        line["snapshot_id"] = proposal.snapshot_id
        line["proposal_revision"] = proposal.revision
        line["created_by"] = user.uid
        line["materialized_at"] = _utc_now().isoformat()
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
        
    if materialized_count == 0:
        proposal.status = transition(proposal.status, "needs_review")
        result = schemas.RabBridgeMaterializeResponse(
            materialized_count=materialized_count, skipped_items=skipped_items, rab_draft_updated=rab_draft_updated,
        )
        await db.commit()
        return result
    proposal.status = transition(proposal.status, "calculated")
    proposal.status = transition(proposal.status, "materialized")
    proposal.materialization_key = idempotency_key
    proposal.materialized_by = user.uid
    proposal.materialized_at = _utc_now()
    result = schemas.RabBridgeMaterializeResponse(
        materialized_count=materialized_count, skipped_items=skipped_items, rab_draft_updated=rab_draft_updated,
    )
    proposal.materialization_result = result.model_dump()
    _audit_project_action(db, project_id=id, actor=user.uid, action="rab_bridge.materialized", target_id=proposal.id)
    await db.commit()
    return result


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
    assumption.approval_status = request.status
    await db.commit()
    await db.refresh(assumption)
    return assumption


if __name__ == "__main__":

    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("paax_db.main:app", host="0.0.0.0", port=port, reload=True)
