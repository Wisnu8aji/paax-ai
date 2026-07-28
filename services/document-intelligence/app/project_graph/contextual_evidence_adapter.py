"""Contextual Evidence & Canonical Fact Adapter for Document Intelligence."""
import hashlib
import uuid
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple, Optional, Literal

from paax_schemas.contextual_evidence import (
    CanonicalFact,
    EvidenceRegion,
    RawEvidenceArtifact,
    SourceAuthorityEntry,
)
from paax_db import (
    ContextualEvidenceRepository,
    ContextualEvidenceConflict,
    ContextualEvidenceIntegrityError,
)

logger = logging.getLogger(__name__)


@dataclass
class ContextualEvidenceBundleResult:
    bundle_status: Literal["accepted", "existing", "rejected"]
    artifact: Optional[RawEvidenceArtifact]
    regions: List[EvidenceRegion]
    candidates: List[CanonicalFact]
    error: Optional[str] = None


@dataclass
class ContextualFactProposalResult:
    status: Literal["accepted", "existing", "rejected"]
    fact: Optional[CanonicalFact]
    error: Optional[str] = None


class ContextualEvidenceAdapter:
    """Adapts raw extracted DEM observations/sheets into canonical evidence entities with fail-closed repository persistence."""

    def __init__(self, repository: Optional[ContextualEvidenceRepository] = None):
        self.repository = repository

    def materialize_page_evidence(
        self,
        project_id: str,
        snapshot_id: str,
        page_data: Dict[str, Any],
        creator: str = "pipeline_dem",
    ) -> Tuple[RawEvidenceArtifact, EvidenceRegion, SourceAuthorityEntry, List[CanonicalFact]]:
        now_iso = datetime.now(timezone.utc).isoformat()
        document_id = page_data.get("document_id", f"doc_{uuid.uuid4().hex[:8]}")
        page_index = page_data.get("page_index", 0)
        content_bytes = page_data.get("content_bytes", b"")
        if not content_bytes:
            content_bytes = f"{document_id}:{page_index}:{now_iso}".encode("utf-8")

        sha256 = hashlib.sha256(content_bytes).hexdigest()
        artifact_id = f"art_{sha256[:16]}"
        storage_ref = page_data.get("storage_ref", f"s3://paax-artifacts/{project_id}/{document_id}/page_{page_index}.bin")

        artifact = RawEvidenceArtifact(
            schema_version="paax.contextual-evidence.v1",
            artifact_id=artifact_id,
            project_id=project_id,
            document_id=document_id,
            document_revision_id=page_data.get("document_revision_id"),
            artifact_kind="dem_page",
            content_sha256=sha256,
            storage_ref=storage_ref,
            media_type=page_data.get("media_type", "application/octet-stream"),
            byte_size=len(content_bytes),
            created_at=now_iso,
        )

        region_id = f"reg_{hashlib.sha256(f'{artifact_id}:{page_index}'.encode('utf-8')).hexdigest()[:16]}"
        ev_id = page_data.get("evidence_id")
        snap_id = snapshot_id
        if snap_id and not ev_id:
            ev_id = f"ev_{region_id[4:]}"

        region = EvidenceRegion(
            region_id=region_id,
            artifact_id=artifact_id,
            project_id=project_id,
            page_index=page_index,
            sheet_id=page_data.get("sheet_id"),
            sheet_revision_id=page_data.get("sheet_revision_id"),
            view_id=page_data.get("view_id"),
            zone_id=page_data.get("zone_id"),
            bbox_space=page_data.get("bbox_space", "none"),
            bbox=page_data.get("bbox"),
            project_graph_snapshot_id=snap_id,
            project_graph_evidence_id=ev_id,
            created_at=now_iso,
        )

        sheet_ref = page_data.get("sheet_id") or page_data.get("file_name") or f"page_{page_index}"
        authority_id = f"auth_{hashlib.sha256(f'{project_id}:{sheet_ref}'.encode('utf-8')).hexdigest()[:16]}"
        authority = SourceAuthorityEntry(
            authority_id=authority_id,
            project_id=project_id,
            source_kind="dem_sheet_drawing",
            source_ref=sheet_ref,
            version=page_data.get("sheet_revision_id") or "v1",
            scope={
                "drawing_type": page_data.get("drawing_type", "General Drawing"),
                "discipline": page_data.get("discipline", "GEN"),
            },
            evidence_refs=[artifact_id, region_id],
            supersedes_authority_id=None,
            created_by=creator,
            created_at=now_iso,
        )

        facts: List[CanonicalFact] = []
        observations = page_data.get("observations", [])
        for idx, obs in enumerate(observations):
            subject_ref = obs.get("subject_ref") or f"OBS-{page_index}-{idx}"
            fact_type = obs.get("fact_type", "extracted_fact")
            predicate = obs.get("predicate", "value")
            val = obs.get("value")

            fact_seed = f"{snapshot_id}:{subject_ref}:{predicate}:{idx}".encode("utf-8")
            fact_id = f"fact_{hashlib.sha256(fact_seed).hexdigest()[:16]}"

            fact = CanonicalFact(
                fact_id=fact_id,
                project_id=project_id,
                snapshot_id=snapshot_id,
                fact_type=fact_type,
                subject_ref=subject_ref,
                predicate=predicate,
                value=val,
                status="candidate",
                evidence_refs=[region_id],
                source_authority_id=authority_id,
                supersedes_fact_id=None,
                calculation_authority="none",
                created_by=creator,
                created_at=now_iso,
            )
            facts.append(fact)

        return artifact, region, authority, facts

    async def validate_and_persist_bundle(
        self,
        artifact: RawEvidenceArtifact,
        regions: List[EvidenceRegion] = [],
        candidates: List[CanonicalFact] = [],
    ) -> ContextualEvidenceBundleResult:
        if self.repository is None:
            err = "Repository is not configured"
            return ContextualEvidenceBundleResult(
                bundle_status="rejected", artifact=artifact, regions=[], candidates=[], error=err
            )
        try:
            res = await self.repository.append_raw_evidence_bundle(artifact, regions)
            status = "accepted" if res.status == "inserted" else "existing"

            persisted_candidates: List[CanonicalFact] = []
            for candidate in candidates:
                prop_res = await self.propose_canonical_fact(candidate)
                if prop_res.status == "rejected":
                    logger.warning(
                        "Candidate fact %s rejected during bundle persistence: %s",
                        candidate.fact_id,
                        prop_res.error,
                    )
                    return ContextualEvidenceBundleResult(
                        bundle_status="rejected",
                        artifact=artifact,
                        regions=[],
                        candidates=[],
                        error=f"Candidate fact '{candidate.fact_id}' rejected: {prop_res.error}",
                    )
                if prop_res.fact is not None:
                    persisted_candidates.append(prop_res.fact)

            return ContextualEvidenceBundleResult(
                bundle_status=status,
                artifact=artifact,
                regions=regions,
                candidates=persisted_candidates,
            )
        except Exception as e:
            logger.warning("Failing closed: Contextual evidence bundle rejected: %s", e)
            return ContextualEvidenceBundleResult(
                bundle_status="rejected",
                artifact=artifact,
                regions=[],
                candidates=[],
                error=str(e),
            )

    async def propose_canonical_fact(
        self, fact: CanonicalFact
    ) -> ContextualFactProposalResult:
        if self.repository is None:
            err = "Repository is not configured"
            return ContextualFactProposalResult(status="rejected", fact=None, error=err)

        if fact.calculation_authority != "none":
            err = f"Golden Rule violation (§1 AGENTS.md): calculation_authority must be 'none', got '{fact.calculation_authority}'"
            logger.error(err)
            return ContextualFactProposalResult(status="rejected", fact=None, error=err)

        try:
            res = await self.repository.append_canonical_fact(fact)
            status = "accepted" if res.status == "inserted" else "existing"
            return ContextualFactProposalResult(status=status, fact=res.item)
        except Exception as e:
            logger.warning("Failing closed: Canonical fact proposal %s rejected: %s", fact.fact_id, e)
            return ContextualFactProposalResult(status="rejected", fact=None, error=str(e))
