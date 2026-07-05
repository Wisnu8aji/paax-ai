from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.tkg.builder import TkgBuildResult, build_tkg_from_text
from app.perception.bridging_atap import HttpAtapTakeoffClient
from app.perception.bridging_dinding import HttpDindingTakeoffClient
from app.perception.bridging_kuda_kuda import HttpBajaTakeoffClient
from app.perception.bridging_kusen import HttpKusenTakeoffClient
from app.perception.bridging_mep import HttpMepTakeoffClient
from app.perception.bridging_tanah import HttpTanahTakeoffClient
from app.perception.work_items import DrawingWorkItemsResult, WorkItemsRequest, build_work_items


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


@router.post("/work-items", response_model=DrawingWorkItemsResult)
async def group_work_items(req: WorkItemsRequest):
    return build_work_items(
        req.consolidated,
        req.takeoff_items,
        tanah_client=HttpTanahTakeoffClient.from_env(),
        dinding_client=HttpDindingTakeoffClient.from_env(),
        atap_client=HttpAtapTakeoffClient.from_env(),
        baja_client=HttpBajaTakeoffClient.from_env(),
        kusen_client=HttpKusenTakeoffClient.from_env(),
        mep_client=HttpMepTakeoffClient.from_env(),
    )
