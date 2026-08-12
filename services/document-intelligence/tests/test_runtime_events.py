"""Tests for the production worker -> web Event Protocol v2 bridge."""
from __future__ import annotations

import json

import pytest

from app.runtime_events import RuntimeEventPublisher


@pytest.mark.asyncio
async def test_publisher_emits_valid_durable_event_and_increments_sequence(tmp_path):
    sent: list[dict] = []

    async def send(envelope: dict) -> None:
        sent.append(envelope)

    publisher = RuntimeEventPublisher(
        run_id="run-123",
        journal_path=str(tmp_path / "events.jsonl"),
        send=send,
    )

    first = await publisher.emit(
        "agent.started",
        agent_id="paax-agent",
        provider="opencode-go",
        model="deepseek-v4-flash",
        payload_summary={"label": "DeepSeek agent"},
    )
    second = await publisher.emit(
        "task.progress",
        task_id="T10",
        stage="T10",
        payload_summary={"progress": 0.5},
    )

    assert first["params"]["run_id"] == "paax:run:run-123"
    assert first["params"]["sequence"] == 0
    assert second["params"]["sequence"] == 1
    assert first["params"]["event_id"].startswith("paax:evt:run-123:0:")
    assert sent == [first, second]
    lines = (tmp_path / "events.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["params"]["type"] for line in lines] == ["agent.started", "task.progress"]


@pytest.mark.asyncio
async def test_publisher_resumes_sequence_from_existing_journal(tmp_path):
    journal = tmp_path / "events.jsonl"
    journal.write_text(
        json.dumps({"params": {"run_id": "paax:run:run-123", "sequence": 7}}) + "\n",
        encoding="utf-8",
    )
    publisher = RuntimeEventPublisher(run_id="run-123", journal_path=str(journal), send=None)

    event = await publisher.emit("task.started", task_id="T01")

    assert event["params"]["sequence"] == 8
