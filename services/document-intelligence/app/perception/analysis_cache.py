import hashlib
import os
import sqlite3
import tempfile
import json
from typing import Optional

DEFAULT_PATH = os.path.join(tempfile.gettempdir(), "paax_analysis_cache.db")

class AnalysisCache:
    def __init__(self, path: str | None = None, enabled: bool | None = None):
        self.path = path or os.getenv("ANALYSIS_CACHE_PATH", DEFAULT_PATH)
        self.enabled = enabled if enabled is not None else os.getenv("ANALYSIS_CACHE_ENABLED", "1") != "0"
        if self.enabled:
            self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def compute_key(pdf_bytes: bytes, version: str) -> str:
        digest = hashlib.sha256(pdf_bytes).hexdigest()
        return f"{digest}:{version}"

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    cache_key TEXT PRIMARY KEY,
                    pdf_hash TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    hit_count INTEGER NOT NULL DEFAULT 0
                )
            """)

    def get(self, pdf_bytes: bytes, version: str) -> Optional[dict]:
        if not self.enabled:
            return None
        
        key = self.compute_key(pdf_bytes, version)
        with self._connect() as conn:
            cursor = conn.execute("SELECT result_json FROM analysis_cache WHERE cache_key = ?", (key,))
            row = cursor.fetchone()
            if row:
                conn.execute("UPDATE analysis_cache SET hit_count = hit_count + 1 WHERE cache_key = ?", (key,))
                return json.loads(row["result_json"])
        return None

    def put(self, pdf_bytes: bytes, version: str, result: dict) -> None:
        if not self.enabled:
            return
            
        key = self.compute_key(pdf_bytes, version)
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        from datetime import datetime
        now = datetime.now().isoformat()
        
        with self._connect() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO analysis_cache 
                (cache_key, pdf_hash, prompt_version, result_json, created_at, hit_count)
                VALUES (?, ?, ?, ?, ?, COALESCE((SELECT hit_count FROM analysis_cache WHERE cache_key = ?), 0))
            """, (key, pdf_hash, version, json.dumps(result), now, key))

    def stats(self) -> dict:
        if not self.enabled:
            return {"entries": 0, "total_hits": 0}
            
        with self._connect() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt, SUM(hit_count) as hits FROM analysis_cache")
            row = cursor.fetchone()
            return {
                "entries": row["cnt"],
                "total_hits": row["hits"] or 0
            }

    def invalidate_all(self) -> int:
        if not self.enabled:
            return 0
            
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM analysis_cache")
            return cursor.rowcount
