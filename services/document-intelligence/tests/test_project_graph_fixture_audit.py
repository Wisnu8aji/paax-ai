from __future__ import annotations

import importlib
import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = (
    REPO_ROOT
    / "report"
    / "report_drawing_intelligence"
    / "dem_extraction_88pages"
    / "pages"
)
REPORT_PATH = (
    REPO_ROOT
    / "report"
    / "report_drawing_intelligence"
    / "PCKM_FASE_3_FIXTURE_AUDIT_2026-07-15.md"
)
STANDARD_DISCIPLINES = {"architecture", "structure", "mep", "site", "general"}
EXPECTED_DISCIPLINE_MAPPING = {
    "": "unresolved",
    "Architecture": "architecture",
    "Architectural": "architecture",
    "architectural": "architecture",
    "ARSITEKTUR": "architecture",
    "Arsitektur": "architecture",
    "arsitektur": "architecture",
    "Arsitektur/MEP": "general",
    "Elektrikal / Penangkal Petir": "mep",
    "interior design": "architecture",
    "mekanikal": "mep",
    "MEP": "mep",
    "MEP-Electrical": "mep",
    "Plumbing": "mep",
    "SIPIL": "structure",
    "Sipil": "structure",
    "Structural": "structure",
    "Structure": "structure",
    "STRUKTUR": "structure",
    "Struktur": "structure",
    "struktur": "structure",
}

pytestmark = pytest.mark.skipif(
    not any(FIXTURE_DIR.glob("page-*.json")),
    reason="stored 88-page drawing fixture is not available in this checkout",
)


def _modules():
    normalizer = importlib.import_module("app.project_graph.normalizer")
    fixture_audit = importlib.import_module("app.project_graph.fixture_audit")
    return normalizer, fixture_audit


def _fixture_paths() -> list[Path]:
    return sorted(FIXTURE_DIR.glob("page-*.json"))


def test_all_88_observed_discipline_values_are_normalized_or_unresolved():
    _, fixture_audit = _modules()

    audit = fixture_audit.audit_fixture(_fixture_paths())

    assert audit.page_count == 88
    assert len(audit.disciplines) == 88
    assert {item.raw for item in audit.disciplines} == set(EXPECTED_DISCIPLINE_MAPPING)
    assert all(
        item.normalized in STANDARD_DISCIPLINES | {"unresolved"}
        for item in audit.disciplines
    )
    assert {
        item.raw: item.normalized for item in audit.disciplines
    } == EXPECTED_DISCIPLINE_MAPPING


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("J2", "J2"),
        ("j-2", "J2"),
        ("JENDELA (J2)", "J2"),
        ("BV1", "BV1"),
        ("BV 1", "BV1"),
        ("RB3", "RB3"),
        ("RB-3", "RB3"),
    ],
)
def test_known_element_codes_normalize_to_one_canonical_form(raw: str, expected: str):
    normalizer, _ = _modules()

    assert normalizer.normalize_element_code(raw) == expected


def test_fixture_audit_reproduces_dangling_reference_anchor_by_top_level_section():
    _, fixture_audit = _modules()

    audit = fixture_audit.audit_fixture(_fixture_paths())

    assert audit.references.total == 3807
    assert audit.references.dangling == 839
    assert audit.references.pages_with_dangling == 47
    assert audit.references_by_section["sheet_identity"].total == 258
    assert audit.references_by_section["sheet_identity"].dangling == 64
    assert audit.references_by_section["observations"].total == 3549
    assert audit.references_by_section["observations"].dangling == 775


def test_fixture_audit_reports_observation_category_distribution():
    _, fixture_audit = _modules()

    audit = fixture_audit.audit_fixture(_fixture_paths())

    expected = {
        "dimensions": (905, 218),
        "element_labels": (419, 55),
        "geometry_descriptions": (113, 20),
        "grids": (355, 74),
        "levels": (116, 24),
        "materials": (172, 23),
        "notes": (86, 24),
        "patterns": (54, 13),
        "references": (42, 3),
        "spaces": (98, 27),
        "symbols": (182, 57),
        "tables": (36, 14),
        "texts": (971, 223),
    }

    assert {
        category: (counts.total, counts.dangling)
        for category, counts in audit.references_by_observation_category.items()
    } == expected


def test_fixture_audit_derives_counts_from_input_instead_of_using_fixture_constants(
    tmp_path: Path,
):
    _, fixture_audit = _modules()
    page = {
        "source": {"page_index": 0, "page_number": 1},
        "sheet_identity": {
            "discipline": {"value": "Arsitektur"},
            "title": {"value": "Test", "evidence_refs": ["ev-valid", "ev-missing"]},
        },
        "observations": {
            "texts": [
                {"raw": "A", "evidence_refs": ["ev-valid"]},
                {"raw": "B", "evidence_refs": ["ev-other-missing"]},
            ],
            "element_labels": [],
        },
        "evidence": [{"evidence_id": "ev-valid"}],
        "ambiguities": [],
        "conflicts": [],
    }
    path = tmp_path / "page.json"
    path.write_text(json.dumps(page), encoding="utf-8")

    audit = fixture_audit.audit_fixture([path])

    assert audit.page_count == 1
    assert audit.references.total == 4
    assert audit.references.dangling == 2
    assert audit.references.pages_with_dangling == 1


def test_fixture_audit_covers_discipline_value_and_raw_variants(tmp_path: Path):
    _, fixture_audit = _modules()
    page = {
        "source": {"page_index": 0, "page_number": 1},
        "sheet_identity": {
            "discipline": {"value": "Architecture", "raw": "ARSITEKTUR"},
        },
        "observations": {"element_labels": []},
        "evidence": [],
    }
    path = tmp_path / "page.json"
    path.write_text(json.dumps(page), encoding="utf-8")

    audit = fixture_audit.audit_fixture([path])

    assert {
        (item.source_field, item.raw, item.normalized)
        for item in audit.disciplines
    } == {
        ("value", "Architecture", "architecture"),
        ("raw", "ARSITEKTUR", "architecture"),
    }


@pytest.mark.parametrize(
    ("signal_name", "expected_score"),
    [
        ("ambiguity", 0.30),
        ("conflict", 0.30),
        ("fanout", 0.15),
        ("cross_discipline", 0.15),
        ("low_evidence", 0.10),
    ],
)
def test_resolution_risk_uses_deterministic_signal_weights(
    signal_name: str,
    expected_score: float,
):
    _, fixture_audit = _modules()
    signals = fixture_audit.ResolutionRiskSignals(**{signal_name: 1.0})

    risk = fixture_audit.score_resolution_risk(signals)

    assert risk.score == pytest.approx(expected_score)


def test_weighted_score_can_escalate_without_an_explicit_gate():
    _, fixture_audit = _modules()
    signals = fixture_audit.ResolutionRiskSignals(
        ambiguity=0.7,
        conflict=1.0,
    )

    risk = fixture_audit.score_resolution_risk(signals)

    assert risk.score == pytest.approx(0.51)
    assert risk.requires_escalation is True
    assert risk.escalation_reasons == ()


def test_fractional_weight_signals_do_not_impersonate_boolean_escalation_gates():
    _, fixture_audit = _modules()

    risk = fixture_audit.score_resolution_risk(
        fixture_audit.ResolutionRiskSignals(
            conflict=0.1,
            cross_discipline=0.1,
        )
    )

    assert risk.score == pytest.approx(0.045)
    assert risk.requires_escalation is False
    assert risk.escalation_reasons == ()


def test_page_ambiguity_unrelated_to_a_code_does_not_change_its_risk(tmp_path: Path):
    _, fixture_audit = _modules()
    pages = [
        {
            "source": {"page_index": 0, "page_number": 1},
            "sheet_identity": {"discipline": {"value": "Struktur"}},
            "observations": {
                "element_labels": [
                    {"raw": "K1", "confidence": 0.95, "evidence_refs": []},
                ],
            },
            "evidence": [],
            "ambiguities": ["Material spelling needs review."],
            "conflicts": [],
        },
        {
            "source": {"page_index": 1, "page_number": 2},
            "sheet_identity": {"discipline": {"value": "Struktur"}},
            "observations": {
                "element_labels": [
                    {"raw": "K1", "confidence": 0.95, "evidence_refs": []},
                ],
            },
            "evidence": [],
            "ambiguities": [],
            "conflicts": [],
        },
    ]
    paths = []
    for index, page in enumerate(pages):
        path = tmp_path / f"page-{index}.json"
        path.write_text(json.dumps(page), encoding="utf-8")
        paths.append(path)

    audit = fixture_audit.audit_fixture(paths)
    candidate = audit.merge_candidates[0]

    assert candidate.risk.score == pytest.approx(0.10)
    assert candidate.risk.requires_escalation is False
    assert candidate.risk.escalation_reasons == ()


def test_code_specific_page_ambiguity_contributes_weighted_risk(tmp_path: Path):
    _, fixture_audit = _modules()
    pages = [
        {
            "source": {"page_index": 0, "page_number": 1},
            "sheet_identity": {"discipline": {"value": "Struktur"}},
            "observations": {
                "element_labels": [
                    {"raw": "K1", "confidence": 0.95, "evidence_refs": []},
                ],
            },
            "evidence": [],
            "ambiguities": ["K1 location is unclear."],
            "conflicts": [],
        },
        {
            "source": {"page_index": 1, "page_number": 2},
            "sheet_identity": {"discipline": {"value": "Struktur"}},
            "observations": {
                "element_labels": [
                    {"raw": "K1", "confidence": 0.95, "evidence_refs": []},
                ],
            },
            "evidence": [],
            "ambiguities": [],
            "conflicts": [],
        },
    ]
    paths = []
    for index, page in enumerate(pages):
        path = tmp_path / f"page-{index}.json"
        path.write_text(json.dumps(page), encoding="utf-8")
        paths.append(path)

    audit = fixture_audit.audit_fixture(paths)
    candidate = audit.merge_candidates[0]

    assert candidate.risk.score == pytest.approx(0.40)
    assert candidate.risk.requires_escalation is False


@pytest.mark.parametrize(
    ("overrides", "expected_reason"),
    [
        ({"candidate_count": 2}, "multiple_candidates"),
        ({"confidence": 0.77}, "low_confidence"),
        ({"conflict_detected": True}, "conflict_detected"),
        ({"cross_discipline_detected": True}, "cross_discipline"),
        ({"affected_nodes": 21}, "large_impact"),
    ],
)
def test_resolution_risk_enforces_every_explicit_escalation_gate(
    overrides: dict,
    expected_reason: str,
):
    _, fixture_audit = _modules()

    risk = fixture_audit.score_resolution_risk(
        fixture_audit.ResolutionRiskSignals(**overrides)
    )

    assert risk.requires_escalation is True
    assert expected_reason in risk.escalation_reasons


def test_fixture_audit_finds_known_cross_page_merge_candidates():
    _, fixture_audit = _modules()

    audit = fixture_audit.audit_fixture(_fixture_paths())
    candidates = {candidate.code: candidate for candidate in audit.merge_candidates}

    assert candidates["J2"].page_numbers == (21, 22, 27)
    assert candidates["J2"].candidate_count == 1
    assert candidates["J2"].resolution_confidence == pytest.approx(0.95)
    assert candidates["BV1"].page_numbers == (21, 22, 23)
    assert candidates["RB3"].page_numbers == (44, 54, 55, 56)
    assert candidates["K1"].page_numbers == (42, 50, 54)
    assert candidates["K2"].page_numbers == (42, 43, 50, 54)
    assert candidates["K3"].page_numbers == (42, 43, 50, 54)
    assert candidates["K01"].candidate_count == 2
    assert sum(audit.risk_distribution.values()) == len(audit.merge_candidates)
    assert 0.0 <= audit.escalation_percentage <= 100.0


def test_committed_audit_report_is_reproducible_and_explains_calibration():
    _, fixture_audit = _modules()
    audit = fixture_audit.audit_fixture(_fixture_paths())

    rendered = fixture_audit.render_audit_report(audit)

    assert REPORT_PATH.read_text(encoding="utf-8") == rendered
    assert "all 13 observation categories" in rendered
    assert "0.50 threshold" in rendered
    assert "Explicit escalation gates" in rendered
    assert "## Verification Evidence" in rendered
