from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter(prefix="/export", tags=["Export"])

class ExportRequest(BaseModel):
    project_id: str
    export_type: str
    data: Dict[str, Any]

@router.post("/excel")
async def export_excel(req: ExportRequest):
    return {
        "status": "success",
        "url": f"https://storage.googleapis.com/paax-ai-demo/{req.project_id}/export.xlsx"
    }
