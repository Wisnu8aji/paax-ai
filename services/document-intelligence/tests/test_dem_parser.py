from __future__ import annotations

import pytest

from app.transcription.failure_classification import DemProviderError
from app.transcription.parser import parse_and_validate
from app.transcription.providers.base import PageContext
from app.transcription.providers.mock import MockDemAdapter


def _valid_sheet_dict() -> dict:
    return {
        "schema_version": "paax.dem.sheet.v1",
        "run_id": "DEMRUN-20260714-001",
        "document_id": "DOC-PLHUT-001",
        "project_id": "PRJ-001",
        "source": {
            "document_hash": "sha256:abc123",
            "file_name": "test.pdf",
            "page_index": 0,
            "page_number": 1,
            "render_uri": "object://renders/doc-plhut-001/page-001.png",
            "width_px": 4096,
            "height_px": 2896,
        },
        "generation": {
            "provider": "qwen",
            "model_alias": "qwen-3.7-plus",
            "prompt_version": "dem-extraction-v1.0.0",
            "started_at": "2026-07-14T10:00:00Z",
        },
        "sheet_identity": {
            "sheet_number": {"value": "A-01", "confidence": 0.9},
            "title": {"value": "Denah", "confidence": 0.9},
            "discipline": {"value": "architecture", "confidence": 0.9, "status": "ai_interpreted"},
        },
        "completion": {"sections_expected": 13, "sections_completed": 13, "is_complete": True},
    }


def test_parse_and_validate_accepts_valid_output():
    adapter = MockDemAdapter(response=_valid_sheet_dict())
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)

    sheet = parse_and_validate(
        raw_json=_valid_sheet_dict(),
        provider=adapter,
        image_bytes=b"fake-png",
        page_context=context,
        prompt_version="dem-extraction-v1.0.0",
    )

    assert sheet.sheet_identity.title.value == "Denah"


def test_parse_and_validate_repairs_once_then_succeeds():
    broken = _valid_sheet_dict()
    del broken["completion"]
    adapter = MockDemAdapter(response=_valid_sheet_dict())
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)

    sheet = parse_and_validate(
        raw_json=broken,
        provider=adapter,
        image_bytes=b"fake-png",
        page_context=context,
        prompt_version="dem-extraction-v1.0.0",
    )

    assert sheet.completion.is_complete is True


def test_parse_and_validate_fails_with_real_error_after_repair_fails():
    broken = _valid_sheet_dict()
    del broken["completion"]
    still_broken = _valid_sheet_dict()
    del still_broken["completion"]
    adapter = MockDemAdapter(response=still_broken)
    context = PageContext(document_id="DOC-PLHUT-001", page_index=0, page_number=1)

    with pytest.raises(DemProviderError) as exc_info:
        parse_and_validate(
            raw_json=broken,
            provider=adapter,
            image_bytes=b"fake-png",
            page_context=context,
            prompt_version="dem-extraction-v1.0.0",
        )

    assert exc_info.value.kind == "invalid_output"
    assert "completion" in str(exc_info.value)
