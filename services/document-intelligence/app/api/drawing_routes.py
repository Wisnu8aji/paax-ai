from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/drawing", tags=["Drawing"])

class DrawingProcessRequest(BaseModel):
    file_id: str

@router.post("/process")
async def process_drawing(req: DrawingProcessRequest):
    return {
        "status": "success",
        "classifications": ["denah", "potongan"],
        "elements_found": 15
    }
