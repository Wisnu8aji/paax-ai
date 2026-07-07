import sqlite3
import os
import tempfile
from datetime import datetime, timedelta
from typing import Optional

DEFAULT_PATH = os.path.join(tempfile.gettempdir(), "paax_jobs.db")

class JobStore:
    def __init__(self, path: str | None = None):
        self.path = path or os.getenv("JOB_STORE_PATH", DEFAULT_PATH)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analyze_jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    progress_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    request_json TEXT
                )
            """)

    def create(self, job_id: str, request_json: str | None = None) -> None:
        now = datetime.now().isoformat()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO analyze_jobs (job_id, status, progress_message, created_at, updated_at, request_json, attempts) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (job_id, "PENDING", "Menunggu diproses...", now, now, request_json, 0)
            )

    def update(self, job_id: str, **fields) -> None:
        if not fields:
            return
        
        # Serialize result to JSON string
        if "result" in fields:
            res = fields.pop("result")
            if res is not None:
                fields["result_json"] = res.model_dump_json()
            else:
                fields["result_json"] = None
                
        fields["updated_at"] = datetime.now().isoformat()
        
        columns = []
        values = []
        for k, v in fields.items():
            columns.append(f"{k} = ?")
            values.append(v)
            
        values.append(job_id)
        
        query = f"UPDATE analyze_jobs SET {', '.join(columns)} WHERE job_id = ?"
        with self._connect() as conn:
            conn.execute(query, values)

    def get(self, job_id: str) -> Optional["AnalyzeJobStatus"]:
        from app.api.drawing_routes import AnalyzeJobStatus, DrawingAnalysisResponse
        with self._connect() as conn:
            cursor = conn.execute("SELECT * FROM analyze_jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            
        if not row:
            return None
            
        result_json = row["result_json"]
        result = None
        if result_json:
            result = DrawingAnalysisResponse.model_validate_json(result_json)
            
        return AnalyzeJobStatus(
            job_id=row["job_id"],
            status=row["status"],
            progress_message=row["progress_message"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            result=result,
            error=row["error"]
        )
        
    def get_request_json(self, job_id: str) -> Optional[str]:
        with self._connect() as conn:
            cursor = conn.execute("SELECT request_json FROM analyze_jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
        if not row:
            return None
        return row["request_json"]

    def list_stale(self, older_than_minutes: int) -> list[str]:
        threshold = (datetime.now() - timedelta(minutes=older_than_minutes)).isoformat()
        with self._connect() as conn:
            cursor = conn.execute(
                "SELECT job_id FROM analyze_jobs WHERE status IN ('COMPLETED', 'FAILED') AND updated_at < ?",
                (threshold,)
            )
            return [row["job_id"] for row in cursor.fetchall()]

    def increment_attempts(self, job_id: str) -> int:
        with self._connect() as conn:
            conn.execute("UPDATE analyze_jobs SET attempts = attempts + 1, updated_at = ? WHERE job_id = ?", (datetime.now().isoformat(), job_id))
            cursor = conn.execute("SELECT attempts FROM analyze_jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            return row["attempts"]
            
    def delete(self, job_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM analyze_jobs WHERE job_id = ?", (job_id,))
