from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List

router = APIRouter(prefix="/validation", tags=["Validation"])

class ValidationRequest(BaseModel):
    project_id: str
    rab_data: Dict[str, Any]
    schedule_data: Dict[str, Any]

class ValidationResponse(BaseModel):
    status: str
    errors: List[str]
    warnings: List[str]

@router.post("/run", response_model=ValidationResponse)
async def run_validation(req: ValidationRequest):
    return ValidationResponse(
        status="success",
        errors=[],
        warnings=["Harga satuan semen terlalu tinggi"]
    )
