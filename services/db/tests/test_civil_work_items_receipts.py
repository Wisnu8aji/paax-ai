import json
import sqlite3

from paax_db.civil_work_items_live import build_live_civil_work_items


def test_live_civil_ledger_uses_only_active_complete_approved_receipts(tmp_path):
    db_path = tmp_path / "portable.sqlite"
    connection = sqlite3.connect(db_path)
    connection.executescript("""
        CREATE TABLE calculation_receipts (
          receipt_id TEXT PRIMARY KEY, project_id TEXT, mapping_id TEXT, mapping_revision INTEGER,
          work_item_node_id TEXT, measurement_fact_ids TEXT, result NUMERIC, unit TEXT,
          formula_id TEXT, engine_version TEXT, evidence_refs TEXT, canonical_request TEXT,
          human_approval_event_id TEXT, approved_by TEXT, status TEXT, superseded_at TEXT, created_at TEXT
        );
        CREATE TABLE rab_materialization_mapping_audits (id TEXT PRIMARY KEY, action TEXT, revision_after INTEGER);
        CREATE TABLE measurement_facts (
          measurement_id TEXT PRIMARY KEY, project_id TEXT, measurement_type TEXT, value NUMERIC, unit TEXT,
          source_method TEXT, element_ids TEXT, evidence_refs TEXT, formula_inputs TEXT,
          verification_status TEXT, created_at TEXT, superseded_at TEXT
        );
        CREATE TABLE rab_materialization_mappings (
          id TEXT PRIMARY KEY, project_id TEXT, measurement_fact_ids TEXT, work_item_node_id TEXT,
          calculation_type TEXT, approval_status TEXT, created_at TEXT
        );
        CREATE TABLE project_graph_nodes (
          node_id TEXT PRIMARY KEY, project_id TEXT, node_type TEXT, canonical_name TEXT,
          normalized_name TEXT, discipline TEXT, level_id TEXT, verification_status TEXT,
          confidence REAL, properties TEXT
        );
        CREATE TABLE project_graph_evidence (evidence_id TEXT, node_id TEXT, page_index INTEGER, project_id TEXT);
        CREATE TABLE project_graph_node_evidence (node_id TEXT, evidence_id TEXT);
        CREATE TABLE project_graph_edges (project_id TEXT, source_node_id TEXT, target_node_id TEXT);
    """)
    connection.execute("INSERT INTO rab_materialization_mapping_audits VALUES ('APPROVAL-1', 'approved', 2)")
    connection.execute("INSERT INTO project_graph_nodes VALUES ('NODE-1', 'P-1', 'element_occurrence', 'Kolom', 'kolom', 'STR', 'L1', 'human_verified', 1, '{}')")
    request = {
        "calculation_type": "length",
        "facts": [{"measurement_id": "MF-1", "element_ids": ["NODE-1"]}],
    }
    connection.execute("""
        INSERT INTO calculation_receipts VALUES
        ('RECEIPT-1', 'P-1', 'MAP-1', 2, 'NODE-1', '["MF-1"]', 4.5, 'm', 'sum(length)',
         'test', '["EV-1"]', ?, 'APPROVAL-1', 'OWNER', 'complete', NULL, '2026-08-01T00:00:00Z')
    """, (json.dumps(request),))
    connection.execute("""
        INSERT INTO calculation_receipts VALUES
        ('RECEIPT-BLOCKED', 'P-1', 'MAP-1', 2, 'NODE-1', '["MF-1"]', NULL, NULL, NULL,
         'test', '["EV-1"]', ?, 'APPROVAL-1', 'OWNER', 'blocked', NULL, '2026-08-01T00:00:01Z')
    """, (json.dumps(request),))
    connection.commit()
    connection.close()

    payload = build_live_civil_work_items(db_path, "P-1")

    assert payload["summary"]["engine_verified_count"] == 1
    assert payload["summary"]["measurement_verified_count"] == 0
    assert payload["items"][0]["status"] == "engine_verified"
    assert payload["items"][0]["calculation_receipt_id"] == "RECEIPT-1"
