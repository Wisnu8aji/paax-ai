"""Durable worker -> web Event Protocol v2 publisher.

The browser is a consumer of this stream.  Events are written to the local
journal before the optional relay POST, so a relay outage cannot turn a real
model/engine run into a lost or fabricated trace.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

logger = logging.getLogger("app.runtime_events")
EventSender = Callable[[dict[str, Any]], Awaitable[None]]


def _raw_run_id(value: str) -> str:
    clean = str(value).strip()
    return clean.removeprefix("paax:run:") or clean


class RuntimeEventPublisher:
    """Emit only events produced by an actual worker/model/engine operation."""

    def __init__(
        self,
        *,
        run_id: str,
        journal_path: str | None = None,
        gateway_url: str | None = None,
        internal_key: str | None = None,
        send: EventSender | None = None,
    ) -> None:
        self.raw_run_id = _raw_run_id(run_id)
        self.run_id = f"paax:run:{self.raw_run_id}"
        self.journal_path = journal_path or os.getenv("PAAX_AGENT_EVENT_JOURNAL", "").strip() or None
        self.gateway_url = (gateway_url or os.getenv("PAAX_EVENT_GATEWAY_URL", "")).strip().rstrip("/") or None
        self.internal_key = internal_key or os.getenv("INTERNAL_SERVICE_KEY", "").strip() or None
        self._send = send
        self._sequence = self._load_last_sequence() + 1

    def _load_last_sequence(self) -> int:
        if not self.journal_path:
            return -1
        try:
            last = -1
            for line in Path(self.journal_path).read_text(encoding="utf-8").splitlines():
                try:
                    params = json.loads(line).get("params", {})
                except (TypeError, ValueError):
                    continue
                if params.get("run_id") == self.run_id and isinstance(params.get("sequence"), int):
                    last = max(last, params["sequence"])
            return last
        except FileNotFoundError:
            return -1
        except OSError as exc:
            logger.warning("Unable to read runtime event journal: %s", exc)
            return -1

    async def emit(
        self,
        event_type: str,
        *,
        task_id: str | None = None,
        parent_task_id: str | None = None,
        agent_id: str | None = None,
        session_id: str | None = None,
        worker_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        stage: str | None = None,
        payload_summary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        sequence = self._sequence
        self._sequence += 1
        timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        envelope: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": "paax.event",
            "params": {
                "event_id": f"paax:evt:{self.raw_run_id}:{sequence}:{uuid.uuid4().hex[:8]}",
                "run_id": self.run_id,
                "task_id": task_id,
                "parent_task_id": parent_task_id,
                "agent_id": agent_id,
                "session_id": session_id,
                "worker_id": worker_id,
                "provider": provider,
                "model": model,
                "sequence": sequence,
                "timestamp": timestamp,
                "type": event_type,
                "stage": stage,
                "payload_summary": dict(payload_summary or {}),
                "payload_ref": None,
                "redaction_state": "clean",
                "persistence_status": "durable",
            },
        }
        self._append(envelope)
        try:
            if self._send is not None:
                await self._send(envelope)
            elif self.gateway_url:
                await self._post_gateway(envelope)
        except Exception as exc:  # relay visibility must not kill a real job
            logger.warning("Runtime event relay failed for %s/%s: %s", self.raw_run_id, event_type, exc)
        return envelope

    def _append(self, envelope: dict[str, Any]) -> None:
        if not self.journal_path:
            return
        path = Path(self.journal_path)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")) + "\n")
        except OSError as exc:
            logger.warning("Unable to persist runtime event: %s", exc)

    async def _post_gateway(self, envelope: dict[str, Any]) -> None:
        headers = {"Content-Type": "application/json", "X-User-Id": "document-intelligence-worker"}
        if self.internal_key:
            headers["X-Internal-Key"] = self.internal_key
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0)) as client:
            response = await client.post(
                self.gateway_url,
                json={"run_id": self.run_id, "events": [envelope]},
                headers=headers,
            )
            response.raise_for_status()
