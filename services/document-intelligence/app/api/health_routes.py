import os
from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health_check():
    api_key = os.getenv("GEMINI_API_KEY")
    ai_provider_configured = bool(api_key and api_key.strip())
    
    return {
        "status": "ok", 
        "service": "document-intelligence", 
        "version": "0.5.0",
        "mode": "real_ai" if ai_provider_configured else "fallback_demo",
        "ai_provider_configured": ai_provider_configured
    }
