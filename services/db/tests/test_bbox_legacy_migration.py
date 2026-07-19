"""Target 4 (final remediation wave) acceptance tests: legacy pixel-bbox
detection/reporting utility, and its interaction with the evidence-immutable
invariant."""
import pytest

from paax_db import models
from paax_db.bbox_legacy_migration import migrate_legacy_bbox_rows


async def _seed_project(session, *, project_id: str):
    session.add(models.Project(id=project_id, owner_id="OWNER", name="Legacy bbox project"))
    session.add(models.ProjectGraphSnapshot(
        snapshot_id=f"{project_id}-SNAP", project_id=project_id, schema_version="v1",
        source_manifest_hash="fixture", generation_metadata={}, effective_sheet_revision_ids=[],
    ))
    await session.commit()


@pytest.mark.asyncio
async def test_row_with_stated_bbox_space_is_reported_unchanged():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_project(session, project_id="PROJ-LEGACY-1")
        session.add(models.ProjectGraphEvidence(
            snapshot_id="PROJ-LEGACY-1-SNAP", project_id="PROJ-LEGACY-1", evidence_id="EV-1",
            document_id="DOC-1", page_index=0, sheet_id="A-101", kind="text", raw_text="J2",
            bbox_source=[100.0, 200.0, 300.0, 400.0], bbox_space="normalized",
        ))
        await session.commit()

        report = await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-1")

    assert report.unchanged == 1
    assert report.converted == 0


@pytest.mark.asyncio
async def test_legacy_row_with_resolvable_dem_page_dimensions_is_reported_converted():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_project(session, project_id="PROJ-LEGACY-2")
        session.add(models.DemRun(
            id="11111111-1111-1111-1111-111111111111", document_id="DOC-2", document_hash="sha256:x",
            file_name="legacy.pdf", total_pages=1, provider="qwen", prompt_version="v1",
        ))
        session.add(models.DemPage(
            id="22222222-2222-2222-2222-222222222222", run_id="11111111-1111-1111-1111-111111111111",
            page_index=0, status="complete",
            result={"source": {"width_px": 1000, "height_px": 1000}},
        ))
        session.add(models.ProjectGraphEvidence(
            snapshot_id="PROJ-LEGACY-2-SNAP", project_id="PROJ-LEGACY-2", evidence_id="EV-LEGACY",
            document_id="DOC-2", page_index=0, sheet_id="A-101", kind="text", raw_text="J2",
            bbox_source=[100.0, 200.0, 300.0, 400.0],
            dem_page_id="22222222-2222-2222-2222-222222222222",
            bbox_space=None,
        ))
        await session.commit()

        report = await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-2")

    assert report.converted == 1
    assert report.ambiguous == 0
    assert report.failed == 0
    converted_detail = next(d for d in report.details if d["outcome"] == "converted")
    assert converted_detail["would_be_bbox_normalized"] == [0.1, 0.2, 0.3, 0.4]


@pytest.mark.asyncio
async def test_legacy_row_without_dem_page_id_is_reported_ambiguous():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_project(session, project_id="PROJ-LEGACY-3")
        session.add(models.ProjectGraphEvidence(
            snapshot_id="PROJ-LEGACY-3-SNAP", project_id="PROJ-LEGACY-3", evidence_id="EV-NO-PAGE",
            document_id="DOC-3", page_index=0, sheet_id="A-101", kind="text", raw_text="J2",
            bbox_source=[100.0, 200.0, 300.0, 400.0], dem_page_id=None, bbox_space=None,
        ))
        await session.commit()

        report = await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-3")

    assert report.ambiguous == 1
    assert report.converted == 0


@pytest.mark.asyncio
async def test_double_run_produces_identical_report_and_never_mutates_anything():
    """Idempotency: running the (dry-run-only) detection twice must report
    the same outcome both times -- it never writes, so there is nothing to
    make the second run differ."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_project(session, project_id="PROJ-LEGACY-4")
        session.add(models.DemRun(
            id="33333333-3333-3333-3333-333333333333", document_id="DOC-4", document_hash="sha256:y",
            file_name="legacy.pdf", total_pages=1, provider="qwen", prompt_version="v1",
        ))
        session.add(models.DemPage(
            id="44444444-4444-4444-4444-444444444444", run_id="33333333-3333-3333-3333-333333333333",
            page_index=0, status="complete",
            result={"source": {"width_px": 2000, "height_px": 1000}},
        ))
        session.add(models.ProjectGraphEvidence(
            snapshot_id="PROJ-LEGACY-4-SNAP", project_id="PROJ-LEGACY-4", evidence_id="EV-IDEMPOTENT",
            document_id="DOC-4", page_index=0, sheet_id="A-101", kind="text", raw_text="J2",
            bbox_source=[200.0, 100.0, 600.0, 300.0],
            dem_page_id="44444444-4444-4444-4444-444444444444", bbox_space=None,
        ))
        await session.commit()

        first = await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-4")
        second = await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-4")

    assert first.converted == second.converted == 1
    first_bbox = next(d for d in first.details if d["outcome"] == "converted")["would_be_bbox_normalized"]
    second_bbox = next(d for d in second.details if d["outcome"] == "converted")["would_be_bbox_normalized"]
    assert first_bbox == second_bbox

    # bbox_source and bbox_space themselves were never touched (dry-run only).
    from sqlalchemy import select as sa_select
    async with TestSession() as verify_session:
        row = (await verify_session.execute(
            sa_select(models.ProjectGraphEvidence).where(models.ProjectGraphEvidence.evidence_id == "EV-IDEMPOTENT")
        )).scalars().one()
        assert row.bbox_source == [200.0, 100.0, 600.0, 300.0]
        assert row.bbox_space is None


@pytest.mark.asyncio
async def test_dry_run_false_raises_because_evidence_rows_are_immutable():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_project(session, project_id="PROJ-LEGACY-5")
        with pytest.raises(NotImplementedError, match="immutable"):
            await migrate_legacy_bbox_rows(session, project_id="PROJ-LEGACY-5", dry_run=False)
