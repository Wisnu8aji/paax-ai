"""Best-effort producer for the F18.1 ``POST /usage/log`` contract.

It deliberately has no database/session dependency: a telemetry outage must not
poison the transaction that created the snapshot being observed.
"""
from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx


async def emit_best_effort(logger: Callable[[dict[str, Any]], Awaitable[None]] | None, event: dict[str, Any]) -> None:
    """Emit bounded telemetry without changing the observed operation's outcome."""
    if logger is None:
        return
    try:
        await logger(event)
    except Exception:
        return


def usage_logger_from_env() -> Callable[[dict[str, Any]], Awaitable[None]]:
    endpoint = os.getenv("USAGE_LOG_URL", "").rstrip("/")
    internal_key = os.getenv("INTERNAL_SERVICE_KEY", "")

    async def emit(event: dict[str, Any]) -> None:
        if not endpoint or not internal_key:
            return
        try:
            async with httpx.AsyncClient(timeout=0.25) as client:
                await client.post(
                    f"{endpoint}/usage/log", json=event,
                    headers={"X-Internal-Key": internal_key, "X-User-Id": "pckm-observability"},
                )
        except Exception:
            # Delivery is intentionally best-effort; callers keep their result.
            return

    return emit
