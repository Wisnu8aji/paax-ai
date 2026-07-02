from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.tkg.builder import TkgBuildResult, build_tkg_from_text


router = APIRouter(prefix="/drawings/tkg", tags=["TKG"])


class TkgBuildRequest(BaseModel):
    project_id: str
    revision_id: str
    sheet_id: str
    title: str
    raw_text: str


@router.post("/build", response_model=TkgBuildResult)
async def build_tkg(req: TkgBuildRequest):
    return build_tkg_from_text(
        project_id=req.project_id,
        revision_id=req.revision_id,
        sheet_id=req.sheet_id,
        title=req.title,
        raw_text=req.raw_text,
    )
