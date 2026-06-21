from fastapi import APIRouter

router = APIRouter(prefix="/excel", tags=["Excel"])

@router.post("/process")
async def process_excel():
    return {"status": "processed"}
