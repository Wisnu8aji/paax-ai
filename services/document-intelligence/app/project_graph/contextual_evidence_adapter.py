"""Pure, explicit, deterministic ContextualEvidenceAdapter for Document Intelligence.

Boundary: this module materializes caller-supplied provenance into validated
contextual evidence contracts.  It NEVER imports paax_db, writes to any
database, generates random IDs, uses current time, or invents provenance.

All identity is derived deterministically from caller-supplied canonical fields.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, List, Optional, Sequence

from pydantic import BaseModel, Field, field_validator, model_validator

from paax_schemas.contextual_evidence import (
    ArtifactKind,
    BboxSpace,
    CanonicalFact,
    EvidenceRegion,
    RawEvidenceArtifact,
    SourceAuthorityEntry,
)


# ─── Errors ──────────────────────────────────────────────────────────────────

class ContextualEvidenceInputError(ValueError):
    """Raised when caller-supplied input is missing required provenance fields."""


# ─── Input contracts ─────────────────────────────────────────────────────────

class ArtifactInput(BaseModel):
    """Caller-supplied artifact provenance — no defaults generated here."""

    project_id: str = Field(min_length=1)
    snapshot_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    document_revision_id: Optional[str] = None
    artifact_kind: ArtifactKind
    content_sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    byte_size: int = Field(ge=0)
    storage_ref: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    created_at: datetime
    content_bytes: Optional[bytes] = None

    @field_validator("project_id", "snapshot_id", "document_id", "storage_ref", "media_type")
    @classmethod
    def _not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ContextualEvidenceInputError(f"Field must not be blank")
        return v

    @field_validator("created_at")
    @classmethod
    def _tz_required(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ContextualEvidenceInputError("created_at must be timezone-aware")
        return v

    model_config = {"frozen": True}


class ObservationInput(BaseModel):
    """One per-observation evidence record supplied by the caller."""

    observation_id: str = Field(min_length=1)
    subject_ref: str
    fact_type: str = Field(min_length=1)
    predicate: str
    value: Any
    page_index: int = Field(ge=0)
    source_ref: str = Field(min_length=1)
    source_version: str = Field(min_length=1)
    bbox_space: BboxSpace = "none"
    bbox: Optional[List[float]] = None
    project_graph_snapshot_id: Optional[str] = None
    project_graph_evidence_id: Optional[str] = None

    @model_validator(mode="after")
    def _validate_pairs(self) -> "ObservationInput":
        snap = self.project_graph_snapshot_id
        ev = self.project_graph_evidence_id
        if (snap is not None and ev is None) or (snap is None and ev is not None):
            raise ContextualEvidenceInputError(
                "project_graph_snapshot_id and project_graph_evidence_id must appear together"
            )
        return self

    model_config = {"frozen": True}


# ─── Output bundle ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ContextualEvidenceBundle:
    artifact: RawEvidenceArtifact
    regions: List[EvidenceRegion]
    authority: SourceAuthorityEntry
    facts: List[CanonicalFact]


# ─── Deterministic ID derivation ─────────────────────────────────────────────

def _sha_hex(*parts: str, prefix: str = "") -> str:
    """Derive a stable ID from canonical string parts."""
    canonical = "\x00".join(parts)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{prefix}{digest[:24]}" if prefix else digest[:32]


def _dt_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        raise ContextualEvidenceInputError("Timestamp must be timezone-aware")
    return dt.isoformat()


# ─── Core materialization function ────────────────────────────────────────────

def materialize_evidence_bundle(
    artifact_input: ArtifactInput,
    observations: Sequence[ObservationInput],
) -> ContextualEvidenceBundle:
    """Materialize caller-supplied provenance into a validated evidence bundle.

    Rules:
    - validate all input before creating any output;
    - if content_bytes provided, verify declared hash and size;
    - derive stable IDs from canonical explicit identity/hashes only;
    - use the caller-provided timezone-aware timestamp;
    - create one region per distinct observation;
    - preserve graph IDs only when explicitly provided;
    - never import paax_db;
    - do not mutate caller input.
    """
    if not observations:
        raise ContextualEvidenceInputError("At least one observation is required")

    # Validate each observation before any output is created
    for obs in observations:
        if not obs.subject_ref or not obs.subject_ref.strip():
            raise ContextualEvidenceInputError(
                f"Observation '{obs.observation_id}': subject_ref must not be blank"
            )
        if not obs.predicate or not obs.predicate.strip():
            raise ContextualEvidenceInputError(
                f"Observation '{obs.observation_id}': predicate must not be blank"
            )

    # Verify content_bytes if provided
    if artifact_input.content_bytes is not None:
        actual_sha = hashlib.sha256(artifact_input.content_bytes).hexdigest()
        if actual_sha != artifact_input.content_sha256:
            raise ContextualEvidenceInputError(
                f"content_bytes hash mismatch: declared={artifact_input.content_sha256}, "
                f"actual={actual_sha}"
            )
        actual_size = len(artifact_input.content_bytes)
        if actual_size != artifact_input.byte_size:
            raise ContextualEvidenceInputError(
                f"byte_size mismatch: declared={artifact_input.byte_size}, actual={actual_size}"
            )

    created_at_iso = _dt_iso(artifact_input.created_at)

    # Stable artifact_id: derived from content_sha256 and project/document identity
    artifact_id = _sha_hex(
        artifact_input.project_id,
        artifact_input.document_id,
        artifact_input.content_sha256,
        artifact_input.artifact_kind,
        prefix="art_",
    )

    artifact = RawEvidenceArtifact(
        schema_version="paax.contextual-evidence.v1",
        artifact_id=artifact_id,
        project_id=artifact_input.project_id,
        document_id=artifact_input.document_id,
        document_revision_id=artifact_input.document_revision_id,
        artifact_kind=artifact_input.artifact_kind,
        content_sha256=artifact_input.content_sha256,
        storage_ref=artifact_input.storage_ref,
        media_type=artifact_input.media_type,
        byte_size=artifact_input.byte_size,
        created_at=artifact_input.created_at,
    )

    # One region per observation — stable ID from observation canonical identity
    regions: List[EvidenceRegion] = []
    for obs in observations:
        region_id = _sha_hex(
            artifact_id,
            obs.observation_id,
            obs.source_ref,
            obs.source_version,
            str(obs.page_index),
            prefix="reg_",
        )

        # Encode bbox for hashing — None-safe
        bbox_key = json.dumps(obs.bbox, sort_keys=True) if obs.bbox is not None else "null"

        region = EvidenceRegion(
            region_id=region_id,
            artifact_id=artifact_id,
            project_id=artifact_input.project_id,
            page_index=obs.page_index,
            sheet_id=None,
            sheet_revision_id=None,
            view_id=None,
            zone_id=None,
            bbox_space=obs.bbox_space,
            bbox=obs.bbox,
            project_graph_snapshot_id=obs.project_graph_snapshot_id,
            project_graph_evidence_id=obs.project_graph_evidence_id,
            created_at=artifact_input.created_at,
        )
        regions.append(region)

    # Stable authority_id: derived from project + source_ref + source_version
    # Use first observation's source as the authority anchor (all must have same source)
    first_obs = observations[0]
    authority_id = _sha_hex(
        artifact_input.project_id,
        first_obs.source_ref,
        first_obs.source_version,
        prefix="auth_",
    )

    evidence_refs_for_authority = [artifact_id] + [r.region_id for r in regions]

    authority = SourceAuthorityEntry(
        authority_id=authority_id,
        project_id=artifact_input.project_id,
        source_kind="dem_sheet_drawing",
        source_ref=first_obs.source_ref,
        version=first_obs.source_version,
        scope={},
        evidence_refs=evidence_refs_for_authority,
        supersedes_authority_id=None,
        created_by="pipeline_dem",
        created_at=artifact_input.created_at,
    )

    # One fact per observation — stable ID from canonical fact identity
    facts: List[CanonicalFact] = []
    for obs, region in zip(observations, regions):
        fact_id = _sha_hex(
            artifact_input.project_id,
            artifact_input.snapshot_id,
            obs.observation_id,
            obs.subject_ref,
            obs.predicate,
            prefix="fact_",
        )

        fact = CanonicalFact(
            fact_id=fact_id,
            project_id=artifact_input.project_id,
            snapshot_id=artifact_input.snapshot_id,
            fact_type=obs.fact_type,
            subject_ref=obs.subject_ref,
            predicate=obs.predicate,
            value=obs.value,
            status="candidate",
            evidence_refs=[region.region_id],
            source_authority_id=authority_id,
            supersedes_fact_id=None,
            calculation_authority="none",
            created_by="pipeline_dem",
            created_at=artifact_input.created_at,
        )
        facts.append(fact)

    return ContextualEvidenceBundle(
        artifact=artifact,
        regions=regions,
        authority=authority,
        facts=facts,
    )


# ─── Adapter class ────────────────────────────────────────────────────────────

class ContextualEvidenceAdapter:
    """Stateless adapter — wraps the pure materialize_evidence_bundle function.

    No repository, no persistence, no database dependency.
    """

    def materialize_bundle(
        self,
        artifact_input: ArtifactInput,
        observations: Sequence[ObservationInput],
    ) -> ContextualEvidenceBundle:
        return materialize_evidence_bundle(artifact_input, observations)
