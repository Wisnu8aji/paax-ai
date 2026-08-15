"""Find artifact key for run 14a85e41 and verify PDF accessibility."""
import sqlite3
import json
import os
import sys

# Add the service to path
sys.path.insert(0, "services/document-intelligence")
os.environ.pop("PYTHONPATH", None)

RUN_ID = "14a85e41-c73d-425f-a0e8-527eb0878058"
DB_PATH = "D:/paax-data/db/portable.sqlite"

db = sqlite3.connect(DB_PATH, timeout=10)
db.row_factory = sqlite3.Row

run = db.execute("SELECT * FROM dem_runs WHERE id=?", (RUN_ID,)).fetchone()
if run:
    print("Run found:")
    for key in run.keys():
        val = run[key]
        if isinstance(val, str) and len(val) > 100:
            val = val[:100] + "..."
        print(f"  {key}={val!r}")
else:
    print("Run NOT FOUND")
