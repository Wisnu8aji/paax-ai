from fastapi import APIRouter

router = APIRouter(prefix="/pdf", tags=["PDF"])

@router.post("/process")
async def process_pdf():
    return {"status": "processed"}
