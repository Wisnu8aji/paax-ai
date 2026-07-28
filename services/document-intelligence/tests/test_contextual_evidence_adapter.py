"""RED + GREEN tests for pure ContextualEvidenceAdapter (Phase 02C Task 3 + Task 4).

All synthetic provenance, DB imports, and persistence methods must be absent.
The adapter must be deterministic, explicit, and pure.
"""
import hashlib
import importlib
import inspect
import sys
import types
from datetime import datetime, timezone
from typing import Any

import pytest

from app.project_graph.contextual_evidence_adapter import (
    ArtifactInput,
    ContextualEvidenceAdapter,
    ContextualEvidenceBundle,
    ContextualEvidenceInputError,
    ObservationInput,
    materialize_evidence_bundle,
)
from paax_schemas.contextual_evidence import (
    CanonicalFact,
    EvidenceRegion,
    RawEvidenceArtifact,
    SourceAuthorityEntry,
)

_TS = datetime(2026, 7, 29, 12, 0, 0, tzinfo=timezone.utc)
_TS_ISO = "2026-07-29T12:00:00+00:00"


def _base_artifact() -> ArtifactInput:
    content = b"real raw page content bytes"
    sha = hashlib.sha256(content).hexdigest()
    return ArtifactInput(
        project_id="proj_c_1",
        snapshot_id="snap_c_1",
        document_id="doc_abc_001",
        document_revision_id="doc_rev_01",
        artifact_kind="dem_page",
        content_sha256=sha,
        byte_size=len(content),
        storage_ref="s3://paax-real-bucket/proj_c_1/doc_abc_001/page_0.bin",
        media_type="application/octet-stream",
        created_at=_TS,
        content_bytes=content,
    )


def _base_obs() -> ObservationInput:
    return ObservationInput(
        observation_id="obs_001",
        subject_ref="COL-K1-001",
        fact_type="structural_dimension",
        predicate="width_mm",
        value=300,
        page_index=0,
        source_ref="S-A2-102",
        source_version="rev01",
        bbox_space="normalized_page",
        bbox=[0.10, 0.20, 0.30, 0.40],
        project_graph_snapshot_id="snap_c_1",
        project_graph_evidence_id="ev_001",
    )


# ─── RED/GREEN: Module has no runtime paax_db import ─────────────────────────

def test_adapter_module_has_no_paax_db_import():
    """Adapter must not import paax_db at module level — check actual import lines."""
    import app.project_graph.contextual_evidence_adapter as mod
    import ast
    source = inspect.getsource(mod)
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
                assert "paax_db" not in names, "Module must not import paax_db"
            elif isinstance(node, ast.ImportFrom):
                assert node.module != "paax_db" and not (node.module or "").startswith("paax_db."), \
                    "Module must not import from paax_db"


def test_adapter_has_no_persistence_method():
    """Adapter must not have validate_and_persist_bundle or propose_canonical_fact."""
    from app.project_graph import contextual_evidence_adapter as mod
    assert not hasattr(mod, "validate_and_persist_bundle")
    assert not hasattr(mod.ContextualEvidenceAdapter, "validate_and_persist_bundle")
    assert not hasattr(mod.ContextualEvidenceAdapter, "propose_canonical_fact")


# ─── RED/GREEN: Empty input raises ContextualEvidenceInputError ──────────────

def test_empty_artifact_raises():
    """Empty project_id/document_id must fail validation (pydantic min_length or ContextualEvidenceInputError)."""
    import pydantic
    with pytest.raises((ContextualEvidenceInputError, pydantic.ValidationError)):
        ArtifactInput(  # type: ignore[call-arg]
            project_id="",
            snapshot_id="snap",
            document_id="",
            document_revision_id=None,
            artifact_kind="dem_page",
            content_sha256="a" * 64,
            byte_size=10,
            storage_ref="s3://ref",
            media_type="image/png",
            created_at=_TS,
        )


def test_missing_subject_ref_raises():
    obs = ObservationInput(
        observation_id="obs_x",
        subject_ref="",
        fact_type="t",
        predicate="p",
        value=1,
        page_index=0,
        source_ref="sr",
        source_version="v1",
        bbox_space="none",
        bbox=None,
        project_graph_snapshot_id=None,
        project_graph_evidence_id=None,
    )
    art = _base_artifact()
    with pytest.raises(ContextualEvidenceInputError, match="subject_ref"):
        materialize_evidence_bundle(art, [obs])


def test_missing_predicate_raises():
    obs = ObservationInput(
        observation_id="obs_x",
        subject_ref="K1",
        fact_type="t",
        predicate="",
        value=1,
        page_index=0,
        source_ref="sr",
        source_version="v1",
        bbox_space="none",
        bbox=None,
        project_graph_snapshot_id=None,
        project_graph_evidence_id=None,
    )
    art = _base_artifact()
    with pytest.raises(ContextualEvidenceInputError, match="predicate"):
        materialize_evidence_bundle(art, [obs])


def test_empty_observations_raises():
    art = _base_artifact()
    with pytest.raises(ContextualEvidenceInputError, match="observation"):
        materialize_evidence_bundle(art, [])


# ─── RED/GREEN: Deterministic replay ─────────────────────────────────────────

def test_identical_input_produces_identical_output():
    art = _base_artifact()
    obs = _base_obs()
    bundle1 = materialize_evidence_bundle(art, [obs])
    bundle2 = materialize_evidence_bundle(art, [obs])
    assert bundle1.artifact.artifact_id == bundle2.artifact.artifact_id
    assert bundle1.artifact.content_sha256 == bundle2.artifact.content_sha256
    assert bundle1.regions[0].region_id == bundle2.regions[0].region_id
    assert bundle1.facts[0].fact_id == bundle2.facts[0].fact_id


def test_two_calls_with_same_input_produce_same_authority_id():
    art = _base_artifact()
    obs = _base_obs()
    b1 = materialize_evidence_bundle(art, [obs])
    b2 = materialize_evidence_bundle(art, [obs])
    assert b1.authority.authority_id == b2.authority.authority_id


# ─── RED/GREEN: Input immutability ────────────────────────────────────────────

def test_input_object_not_mutated():
    art = _base_artifact()
    obs = _base_obs()
    art_id_before = art.document_id
    obs_ref_before = obs.subject_ref
    materialize_evidence_bundle(art, [obs])
    assert art.document_id == art_id_before
    assert obs.subject_ref == obs_ref_before


# ─── RED/GREEN: Supplied fields are preserved ─────────────────────────────────

def test_supplied_provenance_preserved():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    assert bundle.artifact.document_id == art.document_id
    assert bundle.artifact.document_revision_id == art.document_revision_id
    assert bundle.artifact.content_sha256 == art.content_sha256
    assert bundle.artifact.byte_size == art.byte_size
    assert bundle.artifact.storage_ref == art.storage_ref
    assert bundle.artifact.media_type == art.media_type


def test_graph_ids_preserved_when_provided():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    reg = bundle.regions[0]
    assert reg.project_graph_snapshot_id == obs.project_graph_snapshot_id
    assert reg.project_graph_evidence_id == obs.project_graph_evidence_id


def test_graph_ids_absent_when_not_provided():
    art = _base_artifact()
    obs = ObservationInput(
        observation_id="obs_nogr",
        subject_ref="K2",
        fact_type="t",
        predicate="p",
        value=1,
        page_index=0,
        source_ref="sr",
        source_version="v1",
        bbox_space="none",
        bbox=None,
        project_graph_snapshot_id=None,
        project_graph_evidence_id=None,
    )
    bundle = materialize_evidence_bundle(art, [obs])
    reg = bundle.regions[0]
    assert reg.project_graph_snapshot_id is None
    assert reg.project_graph_evidence_id is None


# ─── RED/GREEN: Hash/size mismatch raises ─────────────────────────────────────

def test_hash_mismatch_raises():
    art = _base_artifact()
    art_bad = ArtifactInput(
        project_id=art.project_id,
        snapshot_id=art.snapshot_id,
        document_id=art.document_id,
        document_revision_id=art.document_revision_id,
        artifact_kind=art.artifact_kind,
        content_sha256="b" * 64,  # wrong hash
        byte_size=art.byte_size,
        storage_ref=art.storage_ref,
        media_type=art.media_type,
        created_at=art.created_at,
        content_bytes=art.content_bytes,
    )
    obs = _base_obs()
    with pytest.raises(ContextualEvidenceInputError, match="hash"):
        materialize_evidence_bundle(art_bad, [obs])


def test_byte_size_mismatch_raises():
    art = _base_artifact()
    art_bad = ArtifactInput(
        project_id=art.project_id,
        snapshot_id=art.snapshot_id,
        document_id=art.document_id,
        document_revision_id=art.document_revision_id,
        artifact_kind=art.artifact_kind,
        content_sha256=art.content_sha256,
        byte_size=99999,  # wrong size
        storage_ref=art.storage_ref,
        media_type=art.media_type,
        created_at=art.created_at,
        content_bytes=art.content_bytes,
    )
    obs = _base_obs()
    with pytest.raises(ContextualEvidenceInputError, match="byte_size"):
        materialize_evidence_bundle(art_bad, [obs])


# ─── RED/GREEN: No synthetic tokens ──────────────────────────────────────────

def test_no_synthetic_tokens_in_output():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])

    forbidden = ["uuid", "page_N", "v1", "GEN", "General Drawing", "extracted_fact"]
    for token in forbidden:
        assert token not in bundle.artifact.artifact_id.lower(), f"token '{token}' found in artifact_id"
        assert token not in bundle.artifact.storage_ref, f"token '{token}' found in storage_ref"
        for fact in bundle.facts:
            assert token not in fact.subject_ref, f"token '{token}' found in subject_ref"
            assert token not in fact.predicate, f"token '{token}' found in predicate"
            assert token not in fact.fact_type, f"token '{token}' found in fact_type"


# ─── RED/GREEN: Per-observation region ───────────────────────────────────────

def test_each_observation_gets_own_region():
    art = _base_artifact()
    obs1 = ObservationInput(
        observation_id="obs_A",
        subject_ref="K1",
        fact_type="t",
        predicate="p",
        value=1,
        page_index=0,
        source_ref="sr",
        source_version="v1",
        bbox_space="normalized_page",
        bbox=[0.1, 0.1, 0.2, 0.2],
        project_graph_snapshot_id=None,
        project_graph_evidence_id=None,
    )
    obs2 = ObservationInput(
        observation_id="obs_B",
        subject_ref="K2",
        fact_type="t",
        predicate="p",
        value=2,
        page_index=0,
        source_ref="sr",
        source_version="v1",
        bbox_space="normalized_page",
        bbox=[0.5, 0.5, 0.2, 0.2],
        project_graph_snapshot_id=None,
        project_graph_evidence_id=None,
    )
    bundle = materialize_evidence_bundle(art, [obs1, obs2])
    assert len(bundle.regions) == 2
    assert len(bundle.facts) == 2
    region_ids = {r.region_id for r in bundle.regions}
    assert len(region_ids) == 2, "Each observation must have a unique region"
    # Each fact references its own region
    for fact in bundle.facts:
        assert any(r.region_id in fact.evidence_refs for r in bundle.regions)


# ─── RED/GREEN: No resolution approved/persisted ──────────────────────────────

def test_no_approved_resolution_in_output():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    for fact in bundle.facts:
        assert fact.status == "candidate", "Adapter must not approve/propagate"
    # Bundle has no resolution_decision
    assert not hasattr(bundle, "decision") or bundle.decision is None  # type: ignore[attr-defined]


# ─── RED/GREEN: calculation_authority is always 'none' ───────────────────────

def test_calculation_authority_is_none():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    for fact in bundle.facts:
        assert fact.calculation_authority == "none"


# ─── RED/GREEN: Output types match schema contracts ───────────────────────────

def test_output_types_match_schema():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    assert isinstance(bundle.artifact, RawEvidenceArtifact)
    for reg in bundle.regions:
        assert isinstance(reg, EvidenceRegion)
    assert isinstance(bundle.authority, SourceAuthorityEntry)
    for fact in bundle.facts:
        assert isinstance(fact, CanonicalFact)


# ─── RED/GREEN: Timestamp from caller ────────────────────────────────────────

def test_caller_timestamp_used():
    art = _base_artifact()
    obs = _base_obs()
    bundle = materialize_evidence_bundle(art, [obs])
    # The artifact created_at must reflect the caller-provided timestamp
    assert bundle.artifact.created_at == _TS


# ─── RED/GREEN: ContextualEvidenceAdapter class still works ──────────────────

def test_adapter_class_materialize_bundle():
    art = _base_artifact()
    obs = _base_obs()
    adapter = ContextualEvidenceAdapter()
    bundle = adapter.materialize_bundle(art, [obs])
    assert isinstance(bundle, ContextualEvidenceBundle)
    assert isinstance(bundle.artifact, RawEvidenceArtifact)
