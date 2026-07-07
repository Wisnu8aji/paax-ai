import hashlib
import os
import sqlite3
import pytest
import uuid
from fastapi.testclient import TestClient

from app.perception.analysis_cache import AnalysisCache
from app.api.drawing_routes import DrawingAnalyzeRequest, DrawingAnalysisResponse

@pytest.fixture
def tmp_db_path(tmp_path):
    return str(tmp_path / "test_cache.db")

@pytest.fixture
def analysis_cache(tmp_db_path):
    return AnalysisCache(tmp_db_path)

def test_compute_key():
    pdf1 = b"dummy1"
    pdf2 = b"dummy2"
    ver1 = "v1"
    ver2 = "v2"
    
    key1 = AnalysisCache.compute_key(pdf1, ver1)
    key2 = AnalysisCache.compute_key(pdf1, ver1)
    key3 = AnalysisCache.compute_key(pdf2, ver1)
    key4 = AnalysisCache.compute_key(pdf1, ver2)
    
    assert key1 == key2
    assert key1 != key3
    assert key1 != key4

def test_put_get_roundtrip(analysis_cache):
    pdf = b"pdf_data"
    ver = "v1"
    result = {"classification": "Plan"}
    
    analysis_cache.put(pdf, ver, result)
    
    cached = analysis_cache.get(pdf, ver)
    assert cached is not None
    assert cached["classification"] == "Plan"
    
    # Hit count should increase
    stats = analysis_cache.stats()
    assert stats["entries"] == 1
    assert stats["total_hits"] == 1
    
    # Get again
    analysis_cache.get(pdf, ver)
    stats = analysis_cache.stats()
    assert stats["total_hits"] == 2

def test_invalidate_all(analysis_cache):
    pdf = b"pdf_data"
    ver = "v1"
    analysis_cache.put(pdf, ver, {"a": "b"})
    assert analysis_cache.stats()["entries"] == 1
    
    deleted = analysis_cache.invalidate_all()
    assert deleted == 1
    assert analysis_cache.stats()["entries"] == 0
    assert analysis_cache.get(pdf, ver) is None

def test_kill_switch(tmp_path):
    os.environ["ANALYSIS_CACHE_ENABLED"] = "0"
    try:
        cache = AnalysisCache(str(tmp_path / "off.db"))
        assert cache.enabled is False
        
        pdf = b"data"
        ver = "v1"
        cache.put(pdf, ver, {"test": "ok"})
        
        assert cache.get(pdf, ver) is None
        assert cache.stats()["entries"] == 0
        assert cache.invalidate_all() == 0
    finally:
        os.environ.pop("ANALYSIS_CACHE_ENABLED")

class FakeCounterClient:
    def __init__(self):
        self.call_count = 0
    def generate_json(self, **kwargs):
        self.call_count += 1
        return {"a": "b"}

def test_drawing_routes_cache_hits_and_skips_llm(tmp_db_path, tmp_path, monkeypatch):
    import app.api.drawing_routes as routes
    
    cache = AnalysisCache(tmp_db_path)
    monkeypatch.setattr(routes, "_analysis_cache", cache)
    monkeypatch.setattr(routes, "UPLOAD_DIR", str(tmp_path))
    
    dummy_pdf_path = tmp_path / "test_doc.pdf"
    dummy_pdf_path.write_bytes(b"%%EOF dummy pdf content")
    
    from pydantic import BaseModel
    class DummyDoc(BaseModel):
        sheets: list = []
    
    def fake_assemble(*args, **kwargs):
        return DummyDoc(), [{
            "classification": "Plan", 
            "classification_confidence": 0.9, 
            "needs_vision_fallback": False, 
            "is_raster": False, 
            "ocr_message": None
        }]
        
    def fake_consolidate(doc, ai_client, *args, **kwargs):
        if ai_client:
            ai_client.generate_json(system_prompt="", user_prompt="", response_schema={})
        return DummyDoc()

    monkeypatch.setattr(routes, "assemble_document_from_pdf_bytes", fake_assemble)
    monkeypatch.setattr(routes, "consolidate_document", fake_consolidate)
    monkeypatch.setattr(routes, "aggregate_metrics", lambda x: {"n_unclassified": 0, "span_total": 0, "cakupan": 1.0})
    monkeypatch.setattr(routes, "build_gerbang", lambda x, **kwargs: {})
    monkeypatch.setattr(routes, "render_tkg_txt", lambda x: "dummy text")
    
    fake_ai = FakeCounterClient()
    monkeypatch.setattr(routes.GeminiAiAssistClient, "from_env", lambda: fake_ai)
    
    req = DrawingAnalyzeRequest(file_metadata={"file_name": "test_doc.pdf", "file_type": "application/pdf"})
    
    # Call 1 -> miss, call_count = 1
    res1 = routes._perform_analysis(req)
    assert fake_ai.call_count == 1
    assert res1.classification == "Plan"
    
    # Call 2 -> hit, call_count = 1
    res2 = routes._perform_analysis(req)
    assert fake_ai.call_count == 1 # LLM not called!
    assert res2.classification == "Plan"
    
    # Call 3 with cache disabled -> miss, call_count = 2
    os.environ["ANALYSIS_CACHE_ENABLED"] = "0"
    cache_disabled = AnalysisCache(tmp_db_path)
    monkeypatch.setattr(routes, "_analysis_cache", cache_disabled)
    res3 = routes._perform_analysis(req)
    assert fake_ai.call_count == 2
    os.environ.pop("ANALYSIS_CACHE_ENABLED")
    
    # Call 4 with different PDF -> miss, call_count = 3
    dummy_pdf2_path = tmp_path / "test_doc2.pdf"
    dummy_pdf2_path.write_bytes(b"%%EOF DIFFERENT pdf content")
    req2 = DrawingAnalyzeRequest(file_metadata={"file_name": "test_doc2.pdf", "file_type": "application/pdf"})
    monkeypatch.setattr(routes, "_analysis_cache", cache) # restore enabled cache
    res4 = routes._perform_analysis(req2)
    assert fake_ai.call_count == 3
