from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health_check():
    return {"status": "ok", "service": "document-intelligence", "version": "0.3.0"}
