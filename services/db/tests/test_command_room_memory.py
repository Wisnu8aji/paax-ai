"""Test conversations/messages/durable_memories endpoints -- Fase 4, PLAN.md §9."""
import pytest
from httpx import AsyncClient, ASGITransport
import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

from paax_db.main import app

HEADERS = {"X-Internal-Key": "test-internal-key", "X-User-Id": "user-abc"}


@pytest.mark.asyncio
async def test_conversation_and_message_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/conversations", json={"project_id": "proj-1", "model_alias": "lucent", "title": "Test chat"}, headers=HEADERS)
        assert res.status_code == 200
        conv = res.json()
        assert conv["user_id"] == "user-abc"
        assert conv["model_alias"] == "lucent"
        assert conv["archived"] is False
        conv_id = conv["id"]

        res = await ac.post(f"/conversations/{conv_id}/messages", json={"role": "user", "content": "Halo", "sequence": 0}, headers=HEADERS)
        assert res.status_code == 200
        res = await ac.post(f"/conversations/{conv_id}/messages", json={"role": "assistant", "content": "Halo juga", "sequence": 1}, headers=HEADERS)
        assert res.status_code == 200

        res = await ac.get(f"/conversations/{conv_id}/messages", headers=HEADERS)
        assert res.status_code == 200
        messages = res.json()
        assert len(messages) == 2
        assert messages[0]["sequence"] == 0
        assert messages[0]["content"] == "Halo"
        assert messages[1]["sequence"] == 1

        res = await ac.get("/conversations", params={"project_id": "proj-1"}, headers=HEADERS)
        assert res.status_code == 200
        convs = res.json()
        assert any(c["id"] == conv_id for c in convs)

        res = await ac.put(f"/conversations/{conv_id}", json={"pinned": True, "title": "Renamed"}, headers=HEADERS)
        assert res.status_code == 200
        updated = res.json()
        assert updated["pinned"] is True
        assert updated["title"] == "Renamed"

        res = await ac.delete(f"/conversations/{conv_id}", headers=HEADERS)
        assert res.status_code == 200

        res = await ac.get(f"/conversations/{conv_id}", headers=HEADERS)
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_durable_memory_create_list_and_supersede():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/memory/durable", json={
            "scope": "project",
            "scope_ref_id": "plhut-surakarta",
            "type": "decision",
            "content": "JSON-1 adalah raw evidence, tidak menghitung volume",
            "source_type": "conversation",
            "source_id": "message_123",
        }, headers=HEADERS)
        assert res.status_code == 200
        memory1 = res.json()
        assert memory1["status"] == "active"
        assert memory1["scope"] == "project"

        res = await ac.get("/memory/durable", params={"scope": "project", "scope_ref_id": "plhut-surakarta"}, headers=HEADERS)
        assert res.status_code == 200
        memories = res.json()
        assert any(m["id"] == memory1["id"] for m in memories)

        # Supersede: memory baru menggantikan yang lama, yang lama harus jadi 'superseded'
        res = await ac.post("/memory/durable", json={
            "scope": "project",
            "scope_ref_id": "plhut-surakarta",
            "type": "correction",
            "content": "Koreksi: JSON-1 juga tidak menghitung luas",
            "source_type": "conversation",
            "source_id": "message_456",
            "supersedes": memory1["id"],
        }, headers=HEADERS)
        assert res.status_code == 200

        res = await ac.get("/memory/durable", params={"scope": "project", "scope_ref_id": "plhut-surakarta", "status": "superseded"}, headers=HEADERS)
        assert res.status_code == 200
        superseded = res.json()
        assert any(m["id"] == memory1["id"] for m in superseded)


@pytest.mark.asyncio
async def test_durable_memory_rejects_invalid_scope_and_type():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/memory/durable", json={
            "scope": "not_a_real_scope",
            "type": "decision",
            "content": "x",
            "source_type": "conversation",
        }, headers=HEADERS)
        assert res.status_code == 400

        res = await ac.post("/memory/durable", json={
            "scope": "project",
            "type": "not_a_real_type",
            "content": "x",
            "source_type": "conversation",
        }, headers=HEADERS)
        assert res.status_code == 400
