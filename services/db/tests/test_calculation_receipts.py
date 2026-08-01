from decimal import Decimal
import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, String, Table, create_engine, select, text

from paax_db import models


@pytest.mark.asyncio
async def test_calculation_receipt_preserves_decimal_result_and_is_immutable():
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="RECEIPT-PROJECT", owner_id="OWNER", name="Receipt"))
        await session.flush()
        receipt = models.CalculationReceipt(
            receipt_id="receipt-1", project_id="RECEIPT-PROJECT", snapshot_id="SNAP-1",
            mapping_id="MAP-1", mapping_revision=1, work_item_node_id="NODE-1",
            measurement_fact_ids=["MF-1"], fact_lineage=[{"measurement_id": "MF-1", "revision": 1, "supersession_state": "active"}],
            calculation_type="length", rule_id="length.v1", engine_version="test", canonical_request={}, input_hash="a" * 64,
            status="complete", result=Decimal("4.500000000"), unit="m", formula_id="length.v1", evidence_refs=["EV-1"],
            approved_by="OWNER", requested_by_service="ai-orchestrator", requested_by_actor="OWNER", idempotency_key="request-1",
        )
        session.add(receipt)
        await session.commit()
        assert receipt.result == Decimal("4.500000000")
        receipt.unit = "mm"
        with pytest.raises(ValueError, match="immutable"):
            await session.commit()


class _CompleteLengthEngine:
    def __init__(self):
        self.calls = 0

    def calculate(self, request):
        self.calls += 1
        return {
            "calculation_id": "ENGINE-CALC-1",
            "status": "complete",
            "result": "4.500000000",
            "unit": "m",
            "formula": "length.v1",
            "engine_version": "test-engine",
        }


async def _seed_approved_receipt_inputs(*, mapping_revision=3):
    from .conftest import TestSession

    async with TestSession() as session:
        session.add(models.Project(id="RECEIPT-PROJECT", owner_id="OWNER", name="Receipt"))
        await session.flush()
        session.add(models.ProjectGraphSnapshot(
            snapshot_id="RECEIPT-SNAPSHOT", project_id="RECEIPT-PROJECT", schema_version="v1",
            source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[], status="active",
        ))
        await session.flush()
        session.add(models.MeasurementFact(
            measurement_id="RECEIPT-FACT", project_id="RECEIPT-PROJECT", snapshot_id="RECEIPT-SNAPSHOT",
            measurement_type="length", value=Decimal("4.500000000"), unit="m", source_method="written_dimension",
            element_ids=["NODE-1"], evidence_refs=["EV-1"], formula_inputs=["length"],
            verification_status="human_verified", audit_metadata={},
        ))
        session.add(models.RabMaterializationMapping(
            id="RECEIPT-MAPPING", project_id="RECEIPT-PROJECT", snapshot_id="RECEIPT-SNAPSHOT",
            work_item_node_id="NODE-1", measurement_fact_ids=["RECEIPT-FACT"], calculation_type="length",
            evidence_refs=["EV-1"], approval_status="approved", created_by="OWNER", revision=mapping_revision,
        ))
        await session.flush()
        session.add(models.RabMaterializationMappingAudit(
            id="RECEIPT-APPROVAL", mapping_id="RECEIPT-MAPPING", action="approved", actor="OWNER",
            revision_before=mapping_revision - 1, revision_after=mapping_revision, metadata_json={},
        ))
        await session.commit()


@pytest.mark.asyncio
async def test_calculation_service_persists_canonical_approved_lineage_and_reuses_idempotency():
    from .conftest import TestSession
    from paax_db.calculation_receipts import calculate_receipt, verify_calculation_receipt

    await _seed_approved_receipt_inputs()
    engine = _CompleteLengthEngine()
    async with TestSession() as session:
        receipt = await calculate_receipt(
            session, project_id="RECEIPT-PROJECT", mapping_id="RECEIPT-MAPPING",
            measurement_fact_ids=["RECEIPT-FACT"], idempotency_key="receipt-request-1",
            requested_by_service="ai-orchestrator", requested_by_actor="OWNER", core_engine_client=engine,
        )
        await session.commit()
        assert receipt.mapping_revision == 3
        assert receipt.human_approval_event_id == "RECEIPT-APPROVAL"
        assert receipt.fact_lineage[0]["measurement_id"] == "RECEIPT-FACT"
        assert receipt.fact_lineage[0]["superseded_at"] is None
        assert receipt.fact_lineage[0]["evidence_refs"] == ["EV-1"]
        assert receipt.fact_lineage[0]["formula_inputs"] == ["length"]
        assert receipt.canonical_request["facts"][0]["value"] == "4.500000000"
        assert receipt.result == Decimal("4.500000000")
        assert verify_calculation_receipt(receipt) is True

    async with TestSession() as session:
        replay = await calculate_receipt(
            session, project_id="RECEIPT-PROJECT", mapping_id="RECEIPT-MAPPING",
            measurement_fact_ids=["RECEIPT-FACT"], idempotency_key="receipt-request-1",
            requested_by_service="ai-orchestrator", requested_by_actor="OWNER", core_engine_client=engine,
        )
        assert replay.receipt_id == receipt.receipt_id
        assert engine.calls == 1


@pytest.mark.asyncio
async def test_changed_mapping_revision_supersedes_prior_receipt_without_losing_decimal_result():
    from sqlalchemy import select
    from .conftest import TestSession
    from paax_db.calculation_receipts import advance_mapping_revision, calculate_receipt

    await _seed_approved_receipt_inputs()
    engine = _CompleteLengthEngine()
    async with TestSession() as session:
        first = await calculate_receipt(
            session, project_id="RECEIPT-PROJECT", mapping_id="RECEIPT-MAPPING",
            measurement_fact_ids=["RECEIPT-FACT"], idempotency_key="receipt-request-first",
            requested_by_service="ai-orchestrator", requested_by_actor="OWNER", core_engine_client=engine,
        )
        await session.commit()
    async with TestSession() as session:
        mapping = (await session.execute(select(models.RabMaterializationMapping).where(
            models.RabMaterializationMapping.id == "RECEIPT-MAPPING"
        ))).scalar_one()
        await advance_mapping_revision(session, mapping=mapping, action="approved", actor="OWNER")
        await session.commit()
    async with TestSession() as session:
        second = await calculate_receipt(
            session, project_id="RECEIPT-PROJECT", mapping_id="RECEIPT-MAPPING",
            measurement_fact_ids=["RECEIPT-FACT"], idempotency_key="receipt-request-second",
            requested_by_service="ai-orchestrator", requested_by_actor="OWNER", core_engine_client=engine,
        )
        await session.commit()
        old = (await session.execute(select(models.CalculationReceipt).where(
            models.CalculationReceipt.receipt_id == first.receipt_id
        ))).scalar_one()
        assert second.parent_receipt_id == first.receipt_id
        assert second.mapping_revision == 4
        assert old.status == "superseded" and old.superseded_at is not None
        assert old.result == Decimal("4.500000000")


def test_calculation_receipt_migration_preserves_existing_mapping_as_revision_one():
    migration_path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0039_calculation_receipts.py"
    spec = importlib.util.spec_from_file_location("calculation_receipts_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    metadata = MetaData()
    projects = Table("projects", metadata, Column("id", String, primary_key=True))
    mappings = Table("rab_materialization_mappings", metadata, Column("id", String, primary_key=True))
    audits = Table("rab_materialization_mapping_audits", metadata, Column("id", String, primary_key=True))
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(projects.insert().values(id="P-1"))
        connection.execute(mappings.insert().values(id="M-1"))
        connection.execute(audits.insert().values(id="A-1"))
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()
        row = connection.execute(text("SELECT id, revision FROM rab_materialization_mappings")).one()
        assert row == ("M-1", 1)
