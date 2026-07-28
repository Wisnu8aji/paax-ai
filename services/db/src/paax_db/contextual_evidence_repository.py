"""Repository for Contextual Evidence & Canonical Fact Lineage Storage."""
from datetime import datetime, timezone
from typing import Optional, List, Tuple
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
)


def _parse_dt(dt_val: str | datetime) -> datetime:
    if isinstance(dt_val, datetime):
        return dt_val
    try:
        return datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


class ContextualEvidenceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_raw_artifact(self, artifact: RawEvidenceArtifact) -> RawEvidenceArtifact:
        dt = _parse_dt(artifact.created_at)
        row = RawEvidenceArtifactModel(
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
        self.session.add(row)
        await self.session.flush()
        return artifact

    async def save_evidence_region(self, region: EvidenceRegion) -> EvidenceRegion:
        dt = _parse_dt(region.created_at)
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

    async def save_source_authority(self, authority: SourceAuthorityEntry) -> SourceAuthorityEntry:
        dt = _parse_dt(authority.created_at)
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
        return authority

    async def save_canonical_fact(self, fact: CanonicalFact) -> CanonicalFact:
        if fact.calculation_authority != "none":
            raise ValueError("CanonicalFact calculation_authority MUST be 'none'")
        dt = _parse_dt(fact.created_at)
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
            art_id = ref
            reg_id = None
            reg_check = await self.session.get(EvidenceRegionModel, ref)
            if reg_check is not None:
                reg_id = reg_check.region_id
                art_id = reg_check.artifact_id

            link_row = CanonicalFactEvidenceLinkModel(
                link_id=link_id,
                fact_id=fact.fact_id,
                artifact_id=art_id,
                region_id=reg_id,
                role="source",
            )
            self.session.add(link_row)

        await self.session.flush()
        return fact

    async def save_resolution_decision(self, decision: ResolutionDecision) -> ResolutionDecision:
        if decision.calculation_authority != "none":
            raise ValueError("ResolutionDecision calculation_authority MUST be 'none'")
        dt = _parse_dt(decision.created_at)
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
        return decision

    async def get_fact_lineage(
        self, fact_id: str
    ) -> Tuple[CanonicalFact, Optional[SourceAuthorityEntry], List[RawEvidenceArtifact], List[EvidenceRegion]]:
        stmt = select(CanonicalFactModel).where(CanonicalFactModel.fact_id == fact_id)
        res = await self.session.execute(stmt)
        fact_row = res.scalar_one_or_none()
        if fact_row is None:
            raise ValueError(f"CanonicalFact with id {fact_id} not found")

        stmt_links = select(CanonicalFactEvidenceLinkModel).where(CanonicalFactEvidenceLinkModel.fact_id == fact_id)
        res_links = await self.session.execute(stmt_links)
        links = res_links.scalars().all()

        art_ids = [l.artifact_id for l in links if l.artifact_id]
        reg_ids = [l.region_id for l in links if l.region_id]

        evidence_refs = art_ids + [r for r in reg_ids if r]

        fact = CanonicalFact(
            fact_id=fact_row.fact_id,
            project_id=fact_row.project_id,
            snapshot_id=fact_row.snapshot_id,
            fact_type=fact_row.fact_type,
            subject_ref=fact_row.subject_ref,
            predicate=fact_row.predicate,
            value=fact_row.value,
            status=fact_row.status,
            evidence_refs=evidence_refs if evidence_refs else ["art_unknown"],
            source_authority_id=fact_row.source_authority_id,
            supersedes_fact_id=fact_row.supersedes_fact_id,
            calculation_authority="none",
            created_by=fact_row.created_by,
            created_at=fact_row.created_at.isoformat(),
        )

        auth: Optional[SourceAuthorityEntry] = None
        if fact_row.source_authority_id:
            auth_row = await self.session.get(SourceAuthorityEntryModel, fact_row.source_authority_id)
            if auth_row is not None:
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
                    created_at=auth_row.created_at.isoformat(),
                )

        artifacts: List[RawEvidenceArtifact] = []
        if art_ids:
            stmt_arts = select(RawEvidenceArtifactModel).where(RawEvidenceArtifactModel.artifact_id.in_(art_ids))
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
                        created_at=a_row.created_at.isoformat(),
                    )
                )

        regions: List[EvidenceRegion] = []
        if reg_ids:
            stmt_regs = select(EvidenceRegionModel).where(EvidenceRegionModel.region_id.in_(reg_ids))
            res_regs = await self.session.execute(stmt_regs)
            for r_row in res_regs.scalars().all():
                bbox = None
                if r_row.bbox_x is not None:
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
                        created_at=r_row.created_at.isoformat(),
                    )
                )

        return fact, auth, artifacts, regions

    async def get_resolution_history(self, project_id: str, target_fact_id: str) -> List[ResolutionDecision]:
        stmt = (
            select(ResolutionDecisionModel)
            .where(ResolutionDecisionModel.project_id == project_id)
            .order_by(ResolutionDecisionModel.created_at.desc())
        )
        res = await self.session.execute(stmt)
        decisions: List[ResolutionDecision] = []
        for d_row in res.scalars().all():
            if target_fact_id in d_row.target_fact_ids:
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
                        created_at=d_row.created_at.isoformat(),
                    )
                )
        return decisions

    async def list_active_canonical_facts(self, project_id: str, snapshot_id: str) -> List[CanonicalFact]:
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
            stmt_links = select(CanonicalFactEvidenceLinkModel.artifact_id, CanonicalFactEvidenceLinkModel.region_id).where(
                CanonicalFactEvidenceLinkModel.fact_id == f_row.fact_id
            )
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
                    evidence_refs=refs if refs else ["art_unknown"],
                    source_authority_id=f_row.source_authority_id,
                    supersedes_fact_id=f_row.supersedes_fact_id,
                    calculation_authority="none",
                    created_by=f_row.created_by,
                    created_at=f_row.created_at.isoformat(),
                )
            )
        return facts
