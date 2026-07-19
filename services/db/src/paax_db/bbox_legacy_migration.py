"""Deterministic, idempotent, dry-runnable detection/normalization utility
for legacy project_graph_evidence rows persisted before bbox_space existed
(migration 0031_evidence_coordinate_space, Target 4 final remediation wave).

A row with bbox_space IS NULL predates the explicit coordinate-space
contract entirely (see services/document-intelligence's
app/perception/bbox_canonicalize.py for the current, explicit contract).
This utility re-derives what bbox_normalized *would be* from bbox_source
using the DEM page's known source render dimensions (width_px/height_px,
read from dem_pages.result), on the explicit, stated assumption that legacy
bbox_source values are pixel-space -- the coordinate convention this system
used before the normalized-bbox provider contract existed.

IMPORTANT -- ProjectGraphEvidence rows are immutable by design (see
prevent_evidence_update's before_update guard in models.py): this utility
never writes to an existing row, dry_run or not. dry_run=True (the only
mode this module actually applies) computes and reports what each row's
migrated values would be, for audit/review. Actually changing production
data requires building a brand-new snapshot with the migrated evidence
values (the same append-only, revision-scoped mechanism every other
evidence correction in this system already uses) -- that snapshot-level
replay is a separate, larger operation this coordinate-metadata backfill
utility deliberately does not perform; calling with dry_run=False raises
NotImplementedError rather than silently attempting a write that the
immutability guard would reject anyway.

Usage:

    from paax_db.bbox_legacy_migration import migrate_legacy_bbox_rows
    report = await migrate_legacy_bbox_rows(session, project_id="...")
    print(report)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models

COORDINATE_SCHEMA_VERSION = "paax.bbox.v1"
LEGACY_NORMALIZATION_METHOD = "legacy_pixel_migration_divide_by_source_dimensions"


@dataclass
class MigrationReport:
    dry_run: bool
    converted: int = 0
    unchanged: int = 0
    ambiguous: int = 0
    failed: int = 0
    details: list[dict] = field(default_factory=list)

    def record(self, evidence_id: str, outcome: str, reason: str | None = None) -> None:
        if outcome == "converted":
            self.converted += 1
        elif outcome == "unchanged":
            self.unchanged += 1
        elif outcome == "ambiguous":
            self.ambiguous += 1
        elif outcome == "failed":
            self.failed += 1
        self.details.append({"evidence_id": evidence_id, "outcome": outcome, "reason": reason})


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _source_dimensions_from_dem_page(dem_page: models.DemPage | None) -> tuple[float, float] | None:
    if dem_page is None or not isinstance(dem_page.result, dict):
        return None
    source = dem_page.result.get("source")
    if not isinstance(source, dict):
        return None
    width, height = source.get("width_px"), source.get("height_px")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)) or width <= 0 or height <= 0:
        return None
    return float(width), float(height)


async def migrate_legacy_bbox_rows(
    session: AsyncSession,
    *,
    project_id: str,
    dry_run: bool = True,
) -> MigrationReport:
    """Scan project_graph_evidence for rows with bbox_space IS NULL and
    compute what bbox_normalized would be, treating bbox_source as legacy
    pixel-space coordinates. Idempotent: a row already carrying a bbox_space
    is always reported "unchanged". dry_run=False raises NotImplementedError
    -- see this module's docstring for why (evidence rows are immutable by
    design; applying this migration for real requires a new snapshot, not a
    row update)."""
    if not dry_run:
        raise NotImplementedError(
            "ProjectGraphEvidence rows are immutable (see prevent_evidence_update "
            "in models.py) -- this utility can only report what would change "
            "(dry_run=True). Applying a real fix requires building a new "
            "snapshot with the migrated evidence values."
        )
    report = MigrationReport(dry_run=dry_run)

    rows = (await session.execute(
        select(models.ProjectGraphEvidence).where(models.ProjectGraphEvidence.project_id == project_id)
    )).scalars().all()

    dem_page_cache: dict[str, models.DemPage | None] = {}

    for row in rows:
        if row.bbox_space is not None:
            report.record(row.evidence_id, "unchanged", reason="bbox_space already stated")
            continue
        if not row.bbox_source:
            report.record(row.evidence_id, "unchanged", reason="no bbox_source to migrate")
            continue

        dem_page_id = row.dem_page_id
        if not dem_page_id:
            report.record(row.evidence_id, "ambiguous", reason="no dem_page_id to resolve source dimensions from")
            continue

        if dem_page_id not in dem_page_cache:
            dem_page_cache[dem_page_id] = (await session.execute(
                select(models.DemPage).where(models.DemPage.id == dem_page_id)
            )).scalars().first()
        dimensions = _source_dimensions_from_dem_page(dem_page_cache[dem_page_id])
        if dimensions is None:
            report.record(row.evidence_id, "ambiguous", reason="dem_page has no usable source width_px/height_px")
            continue

        try:
            bbox_source = row.bbox_source
            if not (isinstance(bbox_source, (list, tuple)) and len(bbox_source) == 4):
                report.record(row.evidence_id, "failed", reason=f"bbox_source is not a 4-tuple: {bbox_source!r}")
                continue
            width, height = dimensions
            x0, y0, x1, y1 = (float(value) for value in bbox_source)
            normalized = [_clamp(x0 / width), _clamp(y0 / height), _clamp(x1 / width), _clamp(y1 / height)]
        except (TypeError, ValueError, ZeroDivisionError) as exc:
            report.record(row.evidence_id, "failed", reason=str(exc))
            continue

        report.record(row.evidence_id, "converted")
        report.details[-1]["would_be_bbox_normalized"] = normalized

    return report
