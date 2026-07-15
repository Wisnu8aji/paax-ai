from __future__ import annotations

import pytest

from paax_db import models
from paax_db.project_graph_rab_bridge import build_rab_bridge_proposal
from paax_db.project_graph_repository import build_and_activate_snapshot


@pytest.mark.asyncio
async def test_rab_bridge_only_returns_reviewable_evidence_backed_inputs_without_calculation():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="PROJECT-A", owner_id="OWNER-A", name="Project A"))
        await session.commit()
        await build_and_activate_snapshot(
            session, project_id="PROJECT-A", snapshot_id="SNAP-A", schema_version="paax.pckm.graph.v1",
            source_manifest_hash="a", generation_metadata={},
            nodes=[{"node_id": "TYPE-J2", "node_type": "element_type", "canonical_name": "Jendela J2", "normalized_name": "jendela j2", "discipline": "architecture", "verification_status": "extracted", "confidence": 0.9, "properties": {"specification": "aluminium"}}],
            edges=[], evidence=[{"evidence_id": "EV-J2", "document_id": "DOC-A", "page_index": 20, "sheet_id": "A-21", "kind": "text", "raw_text": "Jendela J2 aluminium"}],
            node_evidence=[{"node_id": "TYPE-J2", "evidence_id": "EV-J2", "role": "source"}], edge_evidence=[], aliases=[], communities=[],
        )
        proposal = await build_rab_bridge_proposal(session, project_id="PROJECT-A", node_ids=["TYPE-J2"])

    assert proposal.status == "requires_human_approval"
    assert proposal.snapshot_id == "SNAP-A"
    assert proposal.items == [{"node_id": "TYPE-J2", "name": "Jendela J2", "discipline": "architecture", "properties": {"specification": "aluminium"}, "evidence_ids": ["EV-J2"]}]
    assert not hasattr(proposal, "volume")
    assert not hasattr(proposal, "amount")
