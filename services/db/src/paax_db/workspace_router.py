"""paax_api.workspace_router — Durable Workspace API for saving user frontend session state."""
from __future__ import annotations

import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from paax_db import models
from paax_db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspace", tags=["workspace"])

# In portable desktop mode we use a stable mock actor for now
PORTABLE_ACTOR_ID = "local-desktop-user"


def _get_current_actor_id() -> str:
    # In a full multi-tenant system this would extract the JWT subject.
    # For portable mode, we hardcode to the single user.
    return PORTABLE_ACTOR_ID


class ActorHeadPatch(BaseModel):
    active_project_id: Optional[str] = None
    active_module: Optional[str] = None
    active_tab: Optional[str] = None


class ProjectSessionPatch(BaseModel):
    active_document_id: Optional[str] = None
    active_sheet_id: Optional[str] = None
    selected_sheet_ids: Optional[list[str]] = None
    preferences: Optional[dict[str, Any]] = None
    open_conflict_group: Optional[str] = None
    quantity_mode: Optional[str] = None
    last_viewed_job_id: Optional[str] = None


@router.get("/head")
async def get_actor_head(
    session: AsyncSession = Depends(get_db),
    actor_id: str = Depends(_get_current_actor_id),
):
    """Get the actor's top-level workspace state (active project, module, tab)."""
    head = await session.get(models.ActorWorkspaceHead, actor_id)
    if head is None:
        return {
            "actor_id": actor_id,
            "active_project_id": None,
            "active_module": None,
            "active_tab": None,
            "revision": 0,
        }
    return {
        "actor_id": head.actor_id,
        "active_project_id": head.active_project_id,
        "active_module": head.active_module,
        "active_tab": head.active_tab,
        "revision": head.revision,
    }


@router.patch("/head")
async def patch_actor_head(
    patch: ActorHeadPatch,
    session: AsyncSession = Depends(get_db),
    actor_id: str = Depends(_get_current_actor_id),
):
    """Patch the actor's top-level workspace state. Uses pessimistic upsert."""
    head = await session.get(models.ActorWorkspaceHead, actor_id)
    if head is None:
        head = models.ActorWorkspaceHead(
            actor_id=actor_id,
            active_project_id=patch.active_project_id,
            active_module=patch.active_module,
            active_tab=patch.active_tab,
        )
        session.add(head)
    else:
        if patch.active_project_id is not None:
            head.active_project_id = patch.active_project_id
        if patch.active_module is not None:
            head.active_module = patch.active_module
        if patch.active_tab is not None:
            head.active_tab = patch.active_tab
        head.revision += 1
    
    await session.commit()
    return {
        "actor_id": head.actor_id,
        "active_project_id": head.active_project_id,
        "active_module": head.active_module,
        "active_tab": head.active_tab,
        "revision": head.revision,
    }


@router.get("/project/{project_id}/session")
async def get_project_session(
    project_id: str,
    session: AsyncSession = Depends(get_db),
    actor_id: str = Depends(_get_current_actor_id),
):
    """Get the actor's detailed session state within a specific project."""
    prj = await session.get(models.Project, project_id)
    if not prj:
        raise HTTPException(status_code=404, detail="Project not found")

    psession = await session.get(models.ProjectWorkspaceSession, {"actor_id": actor_id, "project_id": project_id})
    if psession is None:
        return {
            "actor_id": actor_id,
            "project_id": project_id,
            "active_document_id": None,
            "active_sheet_id": None,
            "selected_sheet_ids": [],
            "preferences": {},
            "open_conflict_group": None,
            "quantity_mode": None,
            "last_viewed_job_id": None,
            "revision": 0,
        }
    return {
        "actor_id": psession.actor_id,
        "project_id": psession.project_id,
        "active_document_id": psession.active_document_id,
        "active_sheet_id": psession.active_sheet_id,
        "selected_sheet_ids": psession.selected_sheet_ids,
        "preferences": psession.preferences,
        "open_conflict_group": psession.open_conflict_group,
        "quantity_mode": psession.quantity_mode,
        "last_viewed_job_id": psession.last_viewed_job_id,
        "revision": psession.revision,
    }


@router.patch("/project/{project_id}/session")
async def patch_project_session(
    project_id: str,
    patch: ProjectSessionPatch,
    session: AsyncSession = Depends(get_db),
    actor_id: str = Depends(_get_current_actor_id),
):
    """Patch the actor's detailed session state within a specific project."""
    prj = await session.get(models.Project, project_id)
    if not prj:
        raise HTTPException(status_code=404, detail="Project not found")

    psession = await session.get(models.ProjectWorkspaceSession, {"actor_id": actor_id, "project_id": project_id})
    if psession is None:
        psession = models.ProjectWorkspaceSession(
            actor_id=actor_id,
            project_id=project_id,
            active_document_id=patch.active_document_id,
            active_sheet_id=patch.active_sheet_id,
            selected_sheet_ids=patch.selected_sheet_ids if patch.selected_sheet_ids is not None else [],
            preferences=patch.preferences if patch.preferences is not None else {},
            open_conflict_group=patch.open_conflict_group,
            quantity_mode=patch.quantity_mode,
            last_viewed_job_id=patch.last_viewed_job_id,
        )
        session.add(psession)
    else:
        if patch.active_document_id is not None:
            psession.active_document_id = patch.active_document_id
        if patch.active_sheet_id is not None:
            psession.active_sheet_id = patch.active_sheet_id
        if patch.selected_sheet_ids is not None:
            psession.selected_sheet_ids = patch.selected_sheet_ids
        if patch.preferences is not None:
            psession.preferences = patch.preferences
        if patch.open_conflict_group is not None:
            psession.open_conflict_group = patch.open_conflict_group
        if patch.quantity_mode is not None:
            psession.quantity_mode = patch.quantity_mode
        if patch.last_viewed_job_id is not None:
            psession.last_viewed_job_id = patch.last_viewed_job_id
        psession.revision += 1
        
    await session.commit()
    return {
        "actor_id": psession.actor_id,
        "project_id": psession.project_id,
        "active_document_id": psession.active_document_id,
        "active_sheet_id": psession.active_sheet_id,
        "selected_sheet_ids": psession.selected_sheet_ids,
        "preferences": psession.preferences,
        "open_conflict_group": psession.open_conflict_group,
        "quantity_mode": psession.quantity_mode,
        "last_viewed_job_id": psession.last_viewed_job_id,
        "revision": psession.revision,
    }
