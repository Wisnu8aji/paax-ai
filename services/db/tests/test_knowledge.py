import pytest
from httpx import AsyncClient, ASGITransport
from paax_db.main import app
import uuid

@pytest.mark.asyncio
async def test_knowledge_index_and_search():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Index fake AHSP
        chunk_id = str(uuid.uuid4())
        payload = {
            "id": chunk_id,
            "source_type": "ahsp",
            "source_ref": "TEST-1",
            "content": "Test content",
            "embedding": [0.1] * 768,
            "metadata_json": {"test": "data"}
        }
        res = await ac.post("/knowledge/index", json=payload)
        assert res.status_code == 200
        
        # Test idempotency (index again)
        res = await ac.post("/knowledge/index", json=payload)
        assert res.status_code == 200
        
        # Search
        search_payload = {
            "query_embedding": [0.1] * 768,
            "source_type": "ahsp",
            "top_k": 2
        }
        res_search = await ac.post("/knowledge/search", json=search_payload)
        assert res_search.status_code == 200
        data = res_search.json()
        
        # Make sure our test chunk is there (since test DB might have others, just check if it's there)
        found = any(c["id"] == chunk_id for c in data)
        assert found, "Indexed chunk not found in search results"
