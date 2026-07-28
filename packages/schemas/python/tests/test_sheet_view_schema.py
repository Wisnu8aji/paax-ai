from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from paax_schemas import SheetViews


FIXTURE = Path(__file__).parents[2] / "fixtures" / "sheet-views.valid.json"


def _payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_sheet_views_python_schema_round_trips_shared_fixture() -> None:
    payload = _payload()
    parsed = SheetViews.model_validate(payload)
    assert parsed.model_dump(mode="json") == payload


def test_sheet_views_python_schema_rejects_page_number_rewrite() -> None:
    payload = _payload()
    payload["source"][1]["page_number"] = 99
    with pytest.raises(ValidationError, match="page_number must equal page_index plus one"):
        SheetViews.model_validate(payload)


def test_sheet_views_python_schema_rejects_identity_loss_between_views() -> None:
    payload = _payload()
    payload["classification"].pop()
    with pytest.raises(ValidationError, match="same page identities"):
        SheetViews.model_validate(payload)


def test_sheet_views_python_schema_rejects_duplicate_page_in_a_view() -> None:
    payload = _payload()
    payload["level"].append(payload["level"][0])
    with pytest.raises(ValidationError, match="duplicate page_index"):
        SheetViews.model_validate(payload)
