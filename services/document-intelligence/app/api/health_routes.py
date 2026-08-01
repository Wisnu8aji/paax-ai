import os
from fastapi import APIRouter
from app.perception.ai_report import (
    NVIDIA_DEEPSEEK_MODEL,
    NVIDIA_DRAWING_FAST_MODEL,
    NVIDIA_DRAWING_OCR_MODEL,
    NVIDIA_DRAWING_PARSE_MODEL,
    NVIDIA_DRAWING_REVIEW_MODEL,
    _model_env,
    _nvidia_key_env,
)

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health_check():
    provider_keys = {
        "nvidia": _nvidia_key_env(
            "NVIDIA_DRAWING_FAST_API_KEY",
            "NVIDIA_DRAWING_PARSE_API_KEY",
            "NVIDIA_DRAWING_OCR_API_KEY",
            "NVIDIA_DRAWING_REVIEW_API_KEY",
            "NVIDIA_SOLACE_API_KEY",
            "NVIDIA_LUCENT_API_KEY",
        ),
    }
    configured_providers = [name for name, key in provider_keys.items() if key]
    ai_provider_configured = bool(configured_providers)
    
    try:
        from paax_db.runtime_identity import get_runtime_identity
        runtime_identity = get_runtime_identity("document-intelligence")
    except ImportError:
        import sys
        from pathlib import Path
        db_src = Path(__file__).resolve().parents[3] / "services" / "db" / "src"
        if str(db_src) not in sys.path:
            sys.path.insert(0, str(db_src))
        from paax_db.runtime_identity import get_runtime_identity
        runtime_identity = get_runtime_identity("document-intelligence")

    return {
        "status": "ok", 
        "service": "document-intelligence", 
        "version": "0.5.0",
        "runtime_identity": runtime_identity,
        "mode": "real_ai" if ai_provider_configured else "fallback_demo",
        "ai_provider_configured": ai_provider_configured,
        "providers": configured_providers,
        "nvidia_keys": {
            "fast_visual": bool(_nvidia_key_env("NVIDIA_DRAWING_FAST_API_KEY")),
            "ocr_layout": bool(_nvidia_key_env("NVIDIA_DRAWING_PARSE_API_KEY")),
            "ocr_backup": bool(_nvidia_key_env("NVIDIA_DRAWING_OCR_API_KEY")),
            "deep_review": bool(_nvidia_key_env("NVIDIA_DRAWING_REVIEW_API_KEY")),
            "civil_reasoning": bool(_nvidia_key_env("NVIDIA_SOLACE_API_KEY")),
        },
        "drawing_models": {
            "fast_visual": _model_env("NVIDIA_DRAWING_FAST_MODEL", NVIDIA_DRAWING_FAST_MODEL),
            "ocr_layout": _model_env("NVIDIA_DRAWING_PARSE_MODEL", NVIDIA_DRAWING_PARSE_MODEL),
            "ocr_backup": _model_env("NVIDIA_DRAWING_OCR_MODEL", NVIDIA_DRAWING_OCR_MODEL),
            "deep_review": _model_env("NVIDIA_DRAWING_REVIEW_MODEL", NVIDIA_DRAWING_REVIEW_MODEL),
            "civil_reasoning": _model_env("NVIDIA_SOLACE_MODEL", NVIDIA_DEEPSEEK_MODEL),
        },
    }
