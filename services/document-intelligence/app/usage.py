import os
import httpx
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional

DB_API_URL = os.environ.get("DB_API_URL", "http://localhost:8001")

# SECURITY: INTERNAL_SERVICE_KEY must come from environment.
# No hardcoded fallback — fail-closed outside TESTING=1 mode.
_raw_key = os.environ.get("INTERNAL_SERVICE_KEY")
if not _raw_key and os.environ.get("TESTING") != "1":
    raise RuntimeError(
        "INTERNAL_SERVICE_KEY is not set. "
        "Set it via environment before starting document-intelligence. "
        "In test environments, set TESTING=1."
    )
INTERNAL_KEY = _raw_key or "test-internal-key-testing-only"


class QuotaCheckResult(BaseModel):
    quota_exceeded: bool
    remaining: int

async def check_quota(tenant_id: str) -> QuotaCheckResult:
    if os.environ.get("METERING_ENABLED") == "0":
        return QuotaCheckResult(quota_exceeded=False, remaining=999999)
        
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(
                f"{DB_API_URL}/usage/quota/check",
                params={"tenant_id": tenant_id},
                headers={
                    "X-Internal-Key": INTERNAL_KEY,
                    "X-User-Id": tenant_id
                }
            )
            if res.status_code == 200:
                data = res.json()
                return QuotaCheckResult(
                    quota_exceeded=data.get("quota_exceeded", False),
                    remaining=data.get("remaining", 0)
                )
        except Exception:
            # Fallback allow if DB is unreachable to not break completely
            pass
            
    return QuotaCheckResult(quota_exceeded=False, remaining=999999)

async def log_usage(
    tenant_id: str,
    operation: str,
    success: bool,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
    latency_ms: Optional[int] = None,
    cache_hit: bool = False
):
    if os.environ.get("METERING_ENABLED") == "0":
        return

    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{DB_API_URL}/usage/log",
                json={
                    "tenant_id": tenant_id,
                    "service": "document-intelligence",
                    "operation": operation,
                    "success": success,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "latency_ms": latency_ms,
                    "cache_hit": cache_hit
                },
                headers={
                    "X-Internal-Key": INTERNAL_KEY,
                    "X-User-Id": tenant_id
                }
            )
        except Exception:
            pass # fire and forget, don't break pipeline on logging failure
