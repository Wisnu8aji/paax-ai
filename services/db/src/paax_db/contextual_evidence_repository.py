"""Repository for Contextual Evidence & Canonical Fact Lineage Storage."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Any, Literal, TypeVar, Generic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from paax_schemas.contextual_evidence import (
    RawEvidenceArtifact,
    EvidenceRegion,
    SourceAuthorityEntry,
    CanonicalFact,
    PropagationScope,
    ResolutionDecision,
)
from .models import (
    RawEvidenceArtifactModel,
    EvidenceRegionModel,
    SourceAuthorityEntryModel,
    CanonicalFactModel,
    CanonicalFactEvidenceLinkModel,
    ResolutionDecisionModel,
    ResolutionDecisionFactLinkModel,
    ProjectGraphSnapshot,
    Project,
)


class ContextualEvidenceConflict(Exception):
    """Raised when an append attempt supplies an existing ID with a conflicting payload."""
    pass


class ContextualEvidenceIntegrityError(Exception):
    """Raised when a lineage or relational integrity constraint fails."""
    pass


T = TypeVar("T")


@dataclass
class AppendResult(Generic[T]):
    item: T
    status: Literal["inserted", "existing"]


@dataclass
class CanonicalFactLineage:
    fact: CanonicalFact
    authority: Optional[SourceAuthorityEntry]
    artifacts: List[RawEvidenceArtifact]
    regions: List[EvidenceRegion]
    snapshot: Optional[Any] = None


def _parse_dt(dt_val: str | datetime) -> datetime:
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            raise ValueError("created_at timestamp must be timezone-aware")
        return dt_val
    if not isinstance(dt_val, str) or not dt_val.strip():
        raise ValueError("created_at must be a non-empty string or datetime")
    try:
        dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError("created_at timestamp string must include timezone offset")
        return dt
    except Exception as e:
        raise ValueError(f"Invalid timezone-aware RFC 3339 created_at timestamp: '{dt_val}'") from e


def _dt_to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class ContextualEvidenceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def append_raw_evidence_bundle(
        self, artifact: RawEvidenceArtifact, regions: List[EvidenceRegion] = []
    ) -> AppendResult[RawEvidenceArtifact]:
        dt = _parse_dt(artifact.created_at)

        existing_row = await self.session.get(RawEvidenceArtifactModel, artifact.artifact_id)
        if existing_row is not None:
            if (
                existing_row.project_id == artifact.project_id
                and existing_row.document_id == artifact.document_id
                and existing_row.document_revision_id == artifact.document_revision_id
                and existing_row.artifact_kind == artifact.artifact_kind
                and existing_row.content_sha256 == artifact.content_sha256
                and existing_row.storage_ref == artifact.storage_ref
                and existing_row.media_type == artifact.media_type
                and existing_row.byte_size == artifact.byte_size
            ):
                return AppendResult(item=artifact, status="existing")
            raise ContextualEvidenceConflict(
                f"RawEvidenceArtifact '{artifact.artifact_id}' already exists with a different payload"
            )

        # Validate ALL regions before inserting anything (atomic validation pass)
        region_rows: List[EvidenceRegionModel] = []
        for region in regions:
            if region.artifact_id != artifact.artifact_id:
                raise ContextualEvidenceIntegrityError(
                    f"Region '{region.region_id}' artifact_id '{region.artifact_id}' does not match bundle artifact_id '{artifact.artifact_id}'"
                )
            if region.project_id != artifact.project_id:
                raise ContextualEvidenceIntegrityError(
                    f"Region '{region.region_id}' project_id '{region.project_id}' does not match bundle project_id '{artifact.project_id}'"
                )
            existing_reg = await self.session.get(EvidenceRegionModel, region.region_id)
            if existing_reg is not None:
                if (
                    existing_reg.artifact_id == region.artifact_id
                    and existing_reg.project_id == region.project_id
                    and existing_reg.page_index == region.page_index
                    and existing_reg.bbox_space == region.bbox_space
                ):
                    # Identical region already exists — skip (idempotent)
                    continue
                raise ContextualEvidenceConflict(
                    f"EvidenceRegion '{region.region_id}' already exists with a different payload"
                )

            reg_dt = _parse_dt(region.created_at)
            bbox_x = region.bbox[0] if region.bbox and len(region.bbox) == 4 else None
            bbox_y = region.bbox[1] if region.bbox and len(region.bbox) == 4 else None
            bbox_w = region.bbox[2] if region.bbox and len(region.bbox) == 4 else None
            bbox_h = region.bbox[3] if region.bbox and len(region.bbox) == 4 else None
            region_rows.append(
                EvidenceRegionModel(
                    region_id=region.region_id,
                    artifact_id=region.artifact_id,
                    project_id=region.project_id,
                    page_index=region.page_index,
                    sheet_id=region.sheet_id,
                    sheet_revision_id=region.sheet_revision_id,
                    view_id=region.view_id,
                    zone_id=region.zone_id,
                    bbox_space=region.bbox_space,
                    bbox_x=bbox_x,
                    bbox_y=bbox_y,
                    bbox_w=bbox_w,
                    bbox_h=bbox_h,
                    project_graph_snapshot_id=region.project_graph_snapshot_id,
                    project_graph_evidence_id=region.project_graph_evidence_id,
                    created_at=reg_dt,
                )
            )

        # All validation passed — now add artifact and regions atomically
        art_row = RawEvidenceArtifactModel(
            artifact_id=artifact.artifact_id,
            project_id=artifact.project_id,
            document_id=artifact.document_id,
            document_revision_id=artifact.document_revision_id,
            artifact_kind=artifact.artifact_kind,
            content_sha256=artifact.content_sha256,
            storage_ref=artifact.storage_ref,
            media_type=artifact.media_type,
            byte_size=artifact.byte_size,
            created_at=dt,
        )
        self.session.add(art_row)
        for reg_row in region_rows:
            self.session.add(reg_row)

        # Single flush — atomic: either all rows reach DB buffer or none do
        await self.session.flush()
        return AppendResult(item=artifact, status="inserted")

    async def save_raw_artifact(self, artifact: RawEvidenceArtifact) -> RawEvidenceArtifact:
        res = await self.append_raw_evidence_bundle(artifact)
        return res.item

    async def save_evidence_region(self, region: EvidenceRegion) -> EvidenceRegion:
        dt = _parse_dt(region.created_at)

        existing_row = await self.session.get(EvidenceRegionModel, region.region_id)
        if existing_row is not None:
            if (
                existing_row.artifact_id == region.artifact_id
                and existing_row.project_id == region.project_id
                and existing_row.page_index == region.page_index
                and existing_row.bbox_space == region.bbox_space
            ):
                return region
            raise ContextualEvidenceConflict(
                f"EvidenceRegion '{region.region_id}' already exists with a different payload"
            )

        art_row = await self.session.get(RawEvidenceArtifactModel, region.artifact_id)
        if art_row is None:
            raise ContextualEvidenceIntegrityError(
                f"EvidenceRegion '{region.region_id}' references non-existent artifact '{region.artifact_id}'"
            )
        if art_row.project_id != region.project_id:
            raise ContextualEvidenceIntegrityError(
                f"EvidenceRegion '{region.region_id}' project_id '{region.project_id}' does not match artifact project_id '{art_row.project_id}'"
            )

        bbox_x = region.bbox[0] if region.bbox and len(region.bbox) == 4 else None
        bbox_y = region.bbox[1] if region.bbox and len(region.bbox) == 4 else None
        bbox_w = region.bbox[2] if region.bbox and len(region.bbox) == 4 else None
        bbox_h = region.bbox[3] if region.bbox and len(region.bbox) == 4 else None

        row = EvidenceRegionModel(
            region_id=region.region_id,
            artifact_id=region.artifact_id,
            project_id=region.project_id,
            page_index=region.page_index,
            sheet_id=region.sheet_id,
            sheet_revision_id=region.sheet_revision_id,
            view_id=region.view_id,
            zone_id=region.zone_id,
            bbox_space=region.bbox_space,
            bbox_x=bbox_x,
            bbox_y=bbox_y,
            bbox_w=bbox_w,
            bbox_h=bbox_h,
            project_graph_snapshot_id=region.project_graph_snapshot_id,
            project_graph_evidence_id=region.project_graph_evidence_id,
            created_at=dt,
        )
        self.session.add(row)
        await self.session.flush()
        return region

    async def append_source_authority(self, authority: SourceAuthorityEntry) -> AppendResult[SourceAuthorityEntry]:
        dt = _parse_dt(authority.created_at)

        existing_row = await self.session.get(SourceAuthorityEntryModel, authority.authority_id)
        if existing_row is not None:
            if (
                existing_row.project_id == authority.project_id
                and existing_row.source_kind == authority.source_kind
                and existing_row.source_ref == authority.source_ref
                and existing_row.version == authority.version
            ):
                return AppendResult(item=authority, status="existing")
            raise ContextualEvidenceConflict(
                f"SourceAuthorityEntry '{authority.authority_id}' already exists with a different payload"
            )

        for ref_id in authority.evidence_refs:
            art_check = await self.session.get(RawEvidenceArtifactModel, ref_id)
            reg_check = await self.session.get(EvidenceRegionModel, ref_id)
            if art_check is None and reg_check is None:
                raise ContextualEvidenceIntegrityError(
                    f"SourceAuthorityEntry '{authority.authority_id}' references non-existent evidence '{ref_id}'"
                )
            ref_project_id = art_check.project_id if art_check else reg_check.project_id
            if ref_project_id != authority.project_id:
                raise ContextualEvidenceIntegrityError(
                    f"SourceAuthorityEntry '{authority.authority_id}' project_id '{authority.project_id}' does not match evidence project_id '{ref_project_id}'"
                )

        row = SourceAuthorityEntryModel(
            authority_id=authority.authority_id,
            project_id=authority.project_id,
            source_kind=authority.source_kind,
            source_ref=authority.source_ref,
            version=authority.version,
            scope=authority.scope,
            evidence_refs=authority.evidence_refs,
            supersedes_authority_id=authority.supersedes_authority_id,
            created_by=authority.created_by,
            created_at=dt,
        )
        self.session.add(row)
        await self.session.flush()
        return AppendResult(item=authority, status="inserted")

    async def save_source_authority(self, authority: SourceAuthorityEntry) -> SourceAuthorityEntry:
        res = await self.append_source_authority(authority)
        return res.item

    async def append_canonical_fact(self, fact: CanonicalFact) -> AppendResult[CanonicalFact]:
        if fact.calculation_authority != "none":
            raise ValueError("CanonicalFact calculation_authority MUST be 'none'")
        dt = _parse_dt(fact.created_at)

        existing_row = await self.session.get(CanonicalFactModel, fact.fact_id)
        if existing_row is not None:
            if (
                existing_row.project_id == fact.project_id
                and existing_row.snapshot_id == fact.snapshot_id
                and existing_row.fact_type == fact.fact_type
                and existing_row.subject_ref == fact.subject_ref
                and existing_row.predicate == fact.predicate
                and existing_row.status == fact.status
            ):
                return AppendResult(item=fact, status="existing")
            raise ContextualEvidenceConflict(
                f"CanonicalFact '{fact.fact_id}' already exists with a different payload"
            )

        snap_row = await self.session.get(ProjectGraphSnapshot, fact.snapshot_id)
        if snap_row is None:
            raise ContextualEvidenceIntegrityError(
                f"CanonicalFact '{fact.fact_id}' references non-existent snapshot '{fact.snapshot_id}'"
            )
        if snap_row.project_id != fact.project_id:
            raise ContextualEvidenceIntegrityError(
                f"CanonicalFact '{fact.fact_id}' project_id '{fact.project_id}' does not match snapshot project_id '{snap_row.project_id}'"
            )

        if fact.source_authority_id:
            auth_row = await self.session.get(SourceAuthorityEntryModel, fact.source_authority_id)
            if auth_row is None:
                raise ContextualEvidenceIntegrityError(
                    f"CanonicalFact '{fact.fact_id}' references non-existent authority '{fact.source_authority_id}'"
                )
            if auth_row.project_id != fact.project_id:
                raise ContextualEvidenceIntegrityError(
                    f"CanonicalFact '{fact.fact_id}' project_id '{fact.project_id}' does not match authority project_id '{auth_row.project_id}'"
                )

        if not fact.evidence_refs:
            raise ContextualEvidenceIntegrityError(
                f"CanonicalFact '{fact.fact_id}' must have at least one valid evidence reference"
            )

        row = CanonicalFactModel(
            fact_id=fact.fact_id,
            project_id=fact.project_id,
            snapshot_id=fact.snapshot_id,
            fact_type=fact.fact_type,
            subject_ref=fact.subject_ref,
            predicate=fact.predicate,
            value=fact.value,
            status=fact.status,
            source_authority_id=fact.source_authority_id,
            supersedes_fact_id=fact.supersedes_fact_id,
            calculation_authority="none",
            created_by=fact.created_by,
            created_at=dt,
        )
        self.session.add(row)

        for idx, ref in enumerate(fact.evidence_refs):
            link_id = f"link_{fact.fact_id}_{idx}"
            art_check = await self.session.get(RawEvidenceArtifactModel, ref)
            reg_check = await self.session.get(EvidenceRegionModel, ref)

            if art_check is None and reg_check is None:
                raise ContextualEvidenceIntegrityError(
                    f"CanonicalFact '{fact.fact_id}' evidence ref '{ref}' not found as artifact or region"
                )

            ref_project_id = art_check.project_id if art_check else reg_check.project_id
            if ref_project_id != fact.project_id:
                raise ContextualEvidenceIntegrityError(
                    f"CanonicalFact '{fact.fact_id}' project_id '{fact.project_id}' does not match evidence ref project_id '{ref_project_id}'"
                )

            art_id = art_check.artifact_id if art_check else reg_check.artifact_id
            reg_id = reg_check.region_id if reg_check else None

            link_row = CanonicalFactEvidenceLinkModel(
                link_id=link_id,
                fact_id=fact.fact_id,
                project_id=fact.project_id,
                artifact_id=art_id,
                region_id=reg_id,
                role="source",
            )
            self.session.add(link_row)

        await self.session.flush()
        return AppendResult(item=fact, status="inserted")

    async def save_canonical_fact(self, fact: CanonicalFact) -> CanonicalFact:
        res = await self.append_canonical_fact(fact)
        return res.item

    async def append_resolution_decision(
        self, decision: ResolutionDecision
    ) -> AppendResult[ResolutionDecision]:
        if decision.calculation_authority != "none":
            raise ValueError("ResolutionDecision calculation_authority MUST be 'none'")
        dt = _parse_dt(decision.created_at)

        existing_row = await self.session.get(ResolutionDecisionModel, decision.decision_id)
        if existing_row is not None:
            if (
                existing_row.project_id == decision.project_id
                and existing_row.snapshot_id == decision.snapshot_id
                and existing_row.status == decision.status
                and existing_row.selected_fact_id == decision.selected_fact_id
            ):
                return AppendResult(item=decision, status="existing")
            raise ContextualEvidenceConflict(
                f"ResolutionDecision '{decision.decision_id}' already exists with a different payload"
            )

        snap_row = await self.session.get(ProjectGraphSnapshot, decision.snapshot_id)
        if snap_row is None:
            raise ContextualEvidenceIntegrityError(
                f"ResolutionDecision '{decision.decision_id}' references non-existent snapshot '{decision.snapshot_id}'"
            )
        if snap_row.project_id != decision.project_id:
            raise ContextualEvidenceIntegrityError(
                f"ResolutionDecision '{decision.decision_id}' project_id '{decision.project_id}' does not match snapshot project_id '{snap_row.project_id}'"
            )

        if decision.scope.project_id != decision.project_id:
            raise ContextualEvidenceIntegrityError(
                f"ResolutionDecision '{decision.decision_id}' scope project_id '{decision.scope.project_id}' does not match decision project_id '{decision.project_id}'"
            )

        for target_id in decision.target_fact_ids:
            target_fact = await self.session.get(CanonicalFactModel, target_id)
            if target_fact is None:
                raise ContextualEvidenceIntegrityError(
                    f"ResolutionDecision '{decision.decision_id}' references non-existent target fact '{target_id}'"
                )
            if target_fact.project_id != decision.project_id:
                raise ContextualEvidenceIntegrityError(
                    f"ResolutionDecision '{decision.decision_id}' project_id '{decision.project_id}' does not match target fact project_id '{target_fact.project_id}'"
                )

        if decision.status == "approved":
            if not decision.selected_fact_id:
                raise ContextualEvidenceIntegrityError(
                    f"ResolutionDecision '{decision.decision_id}' status 'approved' requires selected_fact_id"
                )
            if decision.selected_fact_id not in decision.target_fact_ids:
                raise ContextualEvidenceIntegrityError(
                    f"ResolutionDecision '{decision.decision_id}' selected_fact_id '{decision.selected_fact_id}' must be in target_fact_ids"
                )

        scope_dict = decision.scope.model_dump()
        row = ResolutionDecisionModel(
            decision_id=decision.decision_id,
            project_id=decision.project_id,
            snapshot_id=decision.snapshot_id,
            target_fact_ids=decision.target_fact_ids,
            selected_fact_id=decision.selected_fact_id,
            status=decision.status,
            scope=scope_dict,
            rationale=decision.rationale,
            decided_by=decision.decided_by,
            supersedes_decision_id=decision.supersedes_decision_id,
            calculation_authority="none",
            created_at=dt,
        )
        self.session.add(row)
        await self.session.flush()

        for target_id in decision.target_fact_ids:
            link_id = f"dlink_{decision.decision_id}_{target_id}"
            dlink_row = ResolutionDecisionFactLinkModel(
                link_id=link_id,
                decision_id=decision.decision_id,
                fact_id=target_id,
                project_id=decision.project_id,
                created_at=dt,
            )
            self.session.add(dlink_row)

        await self.session.flush()
        return AppendResult(item=decision, status="inserted")

    async def save_resolution_decision(self, decision: ResolutionDecision) -> ResolutionDecision:
        res = await self.append_resolution_decision(decision)
        return res.item

    async def get_canonical_fact_lineage(
        self, project_id: str, fact_id: str
    ) -> CanonicalFactLineage:
        stmt = select(CanonicalFactModel).where(
            CanonicalFactModel.fact_id == fact_id,
            CanonicalFactModel.project_id == project_id,
        )
        res = await self.session.execute(stmt)
        fact_row = res.scalar_one_or_none()
        if fact_row is None:
            raise ContextualEvidenceIntegrityError(
                f"CanonicalFact '{fact_id}' not found in project '{project_id}'"
            )

        stmt_links = select(CanonicalFactEvidenceLinkModel).where(
            CanonicalFactEvidenceLinkModel.fact_id == fact_id
        )
        res_links = await self.session.execute(stmt_links)
        links = res_links.scalars().all()
        if not links:
            raise ContextualEvidenceIntegrityError(
                f"CanonicalFact '{fact_id}' has no evidence links"
            )

        art_ids = list(dict.fromkeys([l.artifact_id for l in links if l.artifact_id]))
        reg_ids = list(dict.fromkeys([l.region_id for l in links if l.region_id]))

        evidence_refs = art_ids + reg_ids

        fact = CanonicalFact(
            fact_id=fact_row.fact_id,
            project_id=fact_row.project_id,
            snapshot_id=fact_row.snapshot_id,
            fact_type=fact_row.fact_type,
            subject_ref=fact_row.subject_ref,
            predicate=fact_row.predicate,
            value=fact_row.value,
            status=fact_row.status,
            evidence_refs=evidence_refs,
            source_authority_id=fact_row.source_authority_id,
            supersedes_fact_id=fact_row.supersedes_fact_id,
            calculation_authority="none",
            created_by=fact_row.created_by,
            created_at=_dt_to_iso(fact_row.created_at),
        )

        auth: Optional[SourceAuthorityEntry] = None
        if fact_row.source_authority_id:
            auth_row = await self.session.get(SourceAuthorityEntryModel, fact_row.source_authority_id)
            if auth_row is None:
                raise ContextualEvidenceIntegrityError(
                    f"CanonicalFact '{fact_id}' references non-existent source authority '{fact_row.source_authority_id}'"
                )
            auth = SourceAuthorityEntry(
                authority_id=auth_row.authority_id,
                project_id=auth_row.project_id,
                source_kind=auth_row.source_kind,
                source_ref=auth_row.source_ref,
                version=auth_row.version,
                scope=auth_row.scope,
                evidence_refs=auth_row.evidence_refs,
                supersedes_authority_id=auth_row.supersedes_authority_id,
                created_by=auth_row.created_by,
                created_at=_dt_to_iso(auth_row.created_at),
            )

        artifacts: List[RawEvidenceArtifact] = []
        if art_ids:
            stmt_arts = select(RawEvidenceArtifactModel).where(
                RawEvidenceArtifactModel.artifact_id.in_(art_ids),
                RawEvidenceArtifactModel.project_id == project_id,
            )
            res_arts = await self.session.execute(stmt_arts)
            for a_row in res_arts.scalars().all():
                artifacts.append(
                    RawEvidenceArtifact(
                        schema_version="paax.contextual-evidence.v1",
                        artifact_id=a_row.artifact_id,
                        project_id=a_row.project_id,
                        document_id=a_row.document_id,
                        document_revision_id=a_row.document_revision_id,
                        artifact_kind=a_row.artifact_kind,
                        content_sha256=a_row.content_sha256,
                        storage_ref=a_row.storage_ref,
                        media_type=a_row.media_type,
                        byte_size=a_row.byte_size,
                        created_at=_dt_to_iso(a_row.created_at),
                    )
                )

        regions: List[EvidenceRegion] = []
        if reg_ids:
            stmt_regs = select(EvidenceRegionModel).where(
                EvidenceRegionModel.region_id.in_(reg_ids),
                EvidenceRegionModel.project_id == project_id,
            )
            res_regs = await self.session.execute(stmt_regs)
            for r_row in res_regs.scalars().all():
                bbox = None
                if r_row.bbox_x is not None and r_row.bbox_y is not None and r_row.bbox_w is not None and r_row.bbox_h is not None:
                    bbox = [r_row.bbox_x, r_row.bbox_y, r_row.bbox_w, r_row.bbox_h]
                regions.append(
                    EvidenceRegion(
                        region_id=r_row.region_id,
                        artifact_id=r_row.artifact_id,
                        project_id=r_row.project_id,
                        page_index=r_row.page_index,
                        sheet_id=r_row.sheet_id,
                        sheet_revision_id=r_row.sheet_revision_id,
                        view_id=r_row.view_id,
                        zone_id=r_row.zone_id,
                        bbox_space=r_row.bbox_space,
                        bbox=bbox,
                        project_graph_snapshot_id=r_row.project_graph_snapshot_id,
                        project_graph_evidence_id=r_row.project_graph_evidence_id,
                        created_at=_dt_to_iso(r_row.created_at),
                    )
                )

        snap = await self.session.get(ProjectGraphSnapshot, fact_row.snapshot_id)

        return CanonicalFactLineage(
            fact=fact,
            authority=auth,
            artifacts=artifacts,
            regions=regions,
            snapshot=snap,
        )

    async def get_resolution_history(
        self, project_id: str, target_fact_id: str
    ) -> List[ResolutionDecision]:
        stmt = (
            select(ResolutionDecisionModel)
            .join(
                ResolutionDecisionFactLinkModel,
                ResolutionDecisionFactLinkModel.decision_id == ResolutionDecisionModel.decision_id,
            )
            .where(
                ResolutionDecisionFactLinkModel.fact_id == target_fact_id,
                ResolutionDecisionFactLinkModel.project_id == project_id,
            )
            .order_by(ResolutionDecisionModel.created_at.desc())
        )
        res = await self.session.execute(stmt)
        decisions: List[ResolutionDecision] = []
        for d_row in res.scalars().all():
            scope_obj = PropagationScope.model_validate(d_row.scope)
            decisions.append(
                ResolutionDecision(
                    decision_id=d_row.decision_id,
                    project_id=d_row.project_id,
                    snapshot_id=d_row.snapshot_id,
                    target_fact_ids=d_row.target_fact_ids,
                    selected_fact_id=d_row.selected_fact_id,
                    status=d_row.status,
                    scope=scope_obj,
                    rationale=d_row.rationale,
                    decided_by=d_row.decided_by,
                    supersedes_decision_id=d_row.supersedes_decision_id,
                    calculation_authority="none",
                    created_at=_dt_to_iso(d_row.created_at),
                )
            )
        return decisions

    async def list_active_canonical_facts(
        self, project_id: str, snapshot_id: str
    ) -> List[CanonicalFact]:
        stmt = (
            select(CanonicalFactModel)
            .where(
                CanonicalFactModel.project_id == project_id,
                CanonicalFactModel.snapshot_id == snapshot_id,
                CanonicalFactModel.status.in_(["candidate", "human_verified"]),
            )
            .order_by(CanonicalFactModel.created_at.asc())
        )
        res = await self.session.execute(stmt)
        facts: List[CanonicalFact] = []
        for f_row in res.scalars().all():
            stmt_links = select(
                CanonicalFactEvidenceLinkModel.artifact_id, CanonicalFactEvidenceLinkModel.region_id
            ).where(CanonicalFactEvidenceLinkModel.fact_id == f_row.fact_id)
            res_links = await self.session.execute(stmt_links)
            refs = []
            for art_id, reg_id in res_links.all():
                if reg_id:
                    refs.append(reg_id)
                elif art_id:
                    refs.append(art_id)
            facts.append(
                CanonicalFact(
                    fact_id=f_row.fact_id,
                    project_id=f_row.project_id,
                    snapshot_id=f_row.snapshot_id,
                    fact_type=f_row.fact_type,
                    subject_ref=f_row.subject_ref,
                    predicate=f_row.predicate,
                    value=f_row.value,
                    status=f_row.status,
                    evidence_refs=refs,
                    source_authority_id=f_row.source_authority_id,
                    supersedes_fact_id=f_row.supersedes_fact_id,
                    calculation_authority="none",
                    created_by=f_row.created_by,
                    created_at=_dt_to_iso(f_row.created_at),
                )
            )
        return facts
