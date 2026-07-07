import os
import sqlite3
import pytest
import uuid
from fastapi.testclient import TestClient
from datetime import datetime, timedelta

from app.jobs.store import JobStore
from app.api.drawing_routes import router, DrawingAnalysisResponse, DrawingAnalyzeRequest
from app.main import app

@pytest.fixture
def tmp_db_path(tmp_path):
    return str(tmp_path / "test_jobs.db")

@pytest.fixture
def job_store(tmp_db_path):
    return JobStore(tmp_db_path)

def test_job_store_create_get(job_store):
    job_id = str(uuid.uuid4())
    req_json = '{"file_metadata": {"file_name": "test.pdf", "file_type": "application/pdf"}}'
    
    job_store.create(job_id, request_json=req_json)
    job = job_store.get(job_id)
    
    assert job is not None
    assert job.job_id == job_id
    assert job.status == "PENDING"
    assert job.progress_message == "Menunggu diproses..."
    assert job.error is None
    
    saved_req = job_store.get_request_json(job_id)
    assert saved_req == req_json

def test_job_store_update(job_store):
    job_id = str(uuid.uuid4())
    job_store.create(job_id)
    
    job_store.update(job_id, status="PROCESSING", progress_message="Reading...")
    
    job = job_store.get(job_id)
    assert job.status == "PROCESSING"
    assert job.progress_message == "Reading..."

def test_job_store_restart_simulation(tmp_db_path):
    # Simulate first process
    store1 = JobStore(tmp_db_path)
    job_id = str(uuid.uuid4())
    store1.create(job_id)
    
    # Fake result
    result = DrawingAnalysisResponse(
        file_id="123",
        classification="Plan",
        rooms=[],
        doors=[],
        windows=[],
        quantity_candidates=[],
        warnings=[]
    )
    store1.update(job_id, status="COMPLETED", result=result)
    
    # Simulate restart
    store2 = JobStore(tmp_db_path)
    job = store2.get(job_id)
    
    assert job is not None
    assert job.status == "COMPLETED"
    assert job.result is not None
    assert job.result.classification == "Plan"

def test_list_stale_and_delete(job_store):
    job_id_new = str(uuid.uuid4())
    job_id_old = str(uuid.uuid4())
    
    job_store.create(job_id_new)
    job_store.create(job_id_old)
    
    # Manually update job_id_old to be old and COMPLETED
    old_time = (datetime.now() - timedelta(minutes=1500)).isoformat()
    with job_store._connect() as conn:
        conn.execute("UPDATE analyze_jobs SET status = 'COMPLETED', updated_at = ? WHERE job_id = ?", (old_time, job_id_old))
        
    stale_ids = job_store.list_stale(older_than_minutes=1440)
    assert job_id_old in stale_ids
    assert job_id_new not in stale_ids
    
    job_store.delete(job_id_old)
    assert job_store.get(job_id_old) is None

def test_increment_attempts(job_store):
    job_id = str(uuid.uuid4())
    job_store.create(job_id)
    
    attempts = job_store.increment_attempts(job_id)
    assert attempts == 1
    attempts = job_store.increment_attempts(job_id)
    assert attempts == 2

client = TestClient(app)

def test_analyze_endpoints_integration(tmp_db_path, monkeypatch):
    from app.api import drawing_routes
    test_store = JobStore(tmp_db_path)
    monkeypatch.setattr(drawing_routes, "_job_store", test_store)
    
    # Start
    res = client.post("/drawings/analyze/start", json={
        "file_metadata": {"file_name": "test.pdf", "file_type": "application/pdf"}
    })
    assert res.status_code == 200
    job_id = res.json()["job_id"]
    
    # Status
    res = client.get(f"/drawings/analyze/status/{job_id}")
    assert res.status_code == 200
    assert res.json()["status"] in ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
    
    # Fake failure
    test_store.update(job_id, status="FAILED")
    
    # Retry
    res = client.post(f"/drawings/analyze/retry/{job_id}")
    assert res.status_code == 200
    assert res.json()["status"] == "PENDING"
    assert res.json()["attempts"] == 1
    
    # Retry non-failed
    test_store.update(job_id, status="COMPLETED")
    res = client.post(f"/drawings/analyze/retry/{job_id}")
    assert res.status_code == 400
    
    # Max attempts
    test_store.update(job_id, status="FAILED")
    test_store.increment_attempts(job_id) # now 2
    test_store.increment_attempts(job_id) # now 3
    res = client.post(f"/drawings/analyze/retry/{job_id}")
    assert res.status_code == 409
    
    # Cleanup
    res = client.post("/drawings/analyze/cleanup?older_than_minutes=0")
    assert res.status_code == 200
