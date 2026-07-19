"""Persistence helpers that keep Measurement Fact supersession auditable."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from .models import MeasurementFact, MeasurementFactAudit


async def supersede_measurement_fact(session: AsyncSession, *, old_measurement_id: str, replacement: MeasurementFact, actor: str | None) -> MeasurementFact:
    old = await session.get(MeasurementFact, old_measurement_id)
    if old is None:
        raise ValueError("measurement fact to supersede was not found")
    if old.project_id != replacement.project_id or old.snapshot_id != replacement.snapshot_id:
        raise ValueError("supersession requires the same project and snapshot")
    replacement.supersedes_measurement_id = old.measurement_id
    old.verification_status = "superseded"
    old.superseded_at = datetime.now(timezone.utc)
    session.add(replacement)
    session.add(MeasurementFactAudit(measurement_id=old.measurement_id, action="superseded", actor=actor, metadata_json={"replacement_measurement_id": replacement.measurement_id}))
    session.add(MeasurementFactAudit(measurement_id=replacement.measurement_id, action="supersedes", actor=actor, metadata_json={"superseded_measurement_id": old.measurement_id}))
    await session.flush()
    return replacement
