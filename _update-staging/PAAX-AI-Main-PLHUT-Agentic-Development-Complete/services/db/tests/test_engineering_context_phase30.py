import json
from pathlib import Path

from paax_db.engineering_context import build_engineering_context, select_civil_work_items

ROOT = Path(__file__).resolve().parents[3]
PAYLOAD = json.loads((ROOT / "fixtures" / "plhut" / "civil-work-items.json").read_text(encoding="utf-8"))


def test_k2_lantai_2_is_exact_and_core_engine_authoritative():
    context = build_engineering_context("PLHUT-SURAKARTA", PAYLOAD, "Berapa volume kolom K2 lantai 2?")
    assert context["quantity_authority"] == "core_engine"
    assert context["matched_item_count"] == 1
    fact = context["facts"][0]
    assert fact["technical_code"] == "K2"
    assert fact["location"] == "Lantai 2"
    assert fact["count"] == 4
    assert fact["result"] == "2,340 m³"
    assert {citation["page"] for citation in context["citations"]} == {43, 50, 54}


def test_generic_lantai_2_columns_returns_main_types_and_review_item():
    items = select_civil_work_items(PAYLOAD["items"], "Kolom lantai 2 ada apa saja?")
    assert {item["technical_code"] for item in items} == {"K1A", "K2", "K3", "KP"}


def test_kp_volume_forbidden_when_dimensions_missing():
    context = build_engineering_context("PLHUT-SURAKARTA", PAYLOAD, "Berapa volume KP lantai 2?")
    assert context["quantity_authority"] == "measurement_fact"
    assert context["facts"][0]["readiness"] == "needs_review"
    assert context["forbidden_claims"]


def test_unmatched_code_abstains_instead_of_guessing():
    context = build_engineering_context("PLHUT-SURAKARTA", PAYLOAD, "Berapa volume kolom K9 lantai 2?")
    assert context["matched_item_count"] == 0
    assert context["quantity_authority"] == "none"
    assert any("Jangan mengarang" in claim for claim in context["forbidden_claims"])


def test_civil_work_item_payload_integrity_passes_canonical_fixture():
    from paax_db.engineering_context import validate_civil_work_items_payload

    errors = validate_civil_work_items_payload(
        PAYLOAD,
        expected_project_id="PLHUT-SURAKARTA",
        expected_source_sha256=PAYLOAD["source_document_sha256"],
    )
    assert errors == []


def test_civil_work_item_payload_rejects_formula_drift():
    from copy import deepcopy
    from paax_db.engineering_context import validate_civil_work_items_payload

    broken = deepcopy(PAYLOAD)
    broken["items"][5]["result"] = 9.99
    errors = validate_civil_work_items_payload(
        broken,
        expected_project_id="PLHUT-SURAKARTA",
        expected_source_sha256=PAYLOAD["source_document_sha256"],
    )
    assert any("formula drift" in error for error in errors)
