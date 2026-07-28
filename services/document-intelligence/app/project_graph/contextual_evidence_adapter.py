"""Contextual Evidence & Canonical Fact Adapter for Document Intelligence."""
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple, Optional

from paax_schemas.contextual_evidence import (
    CanonicalFact,
    EvidenceRegion,
    RawEvidenceArtifact,
    SourceAuthorityEntry,
)


class ContextualEvidenceAdapter:
    """Adapts raw extracted DEM observations/sheets into canonical evidence entities."""

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
