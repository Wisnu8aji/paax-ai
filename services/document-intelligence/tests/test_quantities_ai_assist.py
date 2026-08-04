from __future__ import annotations

"""Unit tests for quantities AI-assist (Master Plan §4.4) and the
"perlu konfirmasi" safety-net area (§4.5).

All tests are offline: the provider is mocked/faked and the real API key is
never read (conftest blanks provider keys; tests set fake keys via monkeypatch).
"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.drawing_intelligence.models import ElementMeasurementFact, WorkItemCandidate
from app.drawing_intelligence.quantities_ai_assist import (
    DEFAULT_API_URL,
    PAAX_API_KEY_ENV,
    QUANTITY_ALLOWED_FIELDS,
    QUANTITY_ASSIST_MODEL,
    QUANTITY_FORBIDDEN_FIELDS,
    SUPPORTED_ASSIST_MODELS,
    QuantitiesAiAssistClient,
    build_ai_assist_decision,
    build_assist_context,
    build_assist_prompt,
    build_few_shot_examples,
    build_few_shot_section,
    confirmation_reasons_for,
    confirmation_status_for,
    is_perlu_konfirmasi,
    load_golden_set,
    measure_confirmation_area,
    run_quantities_ai_assist,
    should_trigger_ai_assist,
    validate_quantity_proposal,
)
from app.perception.ai_assist.audit_ledger import AppendOnlyProposalAuditLog
from app.perception.ai_assist.contracts import AiAssistDecision

GOLDEN_FIXTURE = Path(__file__).parent / "fixtures" / "golden_quantities_set.json"


def make_item(
    *,
    item_id: str = "work-column-K1-L1",
    category: str = "column",
    code: str | None = "K1",
    label: str = "K1",
    page_indices: list[int] | None = None,
    attributes: dict | None = None,
    evidence_refs: list[str] | None = None,
    missing_information: list[str] | None = None,
    conflict_ids: list[str] | None = None,
    count_authority: str = "candidate",
    maturity: str = "classified",
) -> WorkItemCandidate:
    attrs = dict(attributes or {})
    if "level" not in attrs:
        attrs["level"] = "L1"
    return WorkItemCandidate(
        work_item_id=item_id,
        category=category,
        code=code,
        label=label,
        page_indices=page_indices or [0],
        maturity=maturity,  # type: ignore[arg-type]
        occurrence_count_observed=1,
        accepted_detection_count=0,
        geometry_kind="count",
        evidence_refs=evidence_refs if evidence_refs is not None else ["ev-label-k1-1"],
        source_candidate_ids=["candidate-k1"],
        attributes=attrs,
        missing_information=missing_information or [],
        review_task_ids=[],
        user_accepted=False,
        conflict_ids=conflict_ids or [],
        count_authority=count_authority,  # type: ignore[arg-type]
    )


def make_dimensioned_item() -> WorkItemCandidate:
    return make_item(
        item_id="work-beam-B2-L1",
        category="beam",
        code="B2",
        label="B2",
        attributes={"level": "L1", "dimensions": {"width": 250, "depth": 500, "unit": "mm"}},
        evidence_refs=["ev-label-b2-1"],
    )


def make_fact_dimensioned_item(
    *, verification_status: str = "engine_verified", field: str = "width"
) -> WorkItemCandidate:
    """C2-4: item whose connected dimensions come ONLY from measurement facts
    (engine/human verified), not from attributes — exercises the
    ``_item_has_connected_dimensions`` measurement-fact path."""
    item = make_item(
        item_id="work-beam-B3-L1",
        category="beam",
        code="B3",
        label="B3",
        attributes={"level": "L1"},  # no ``dimensions`` display at all
        evidence_refs=["ev-label-b3-1"],
    )
    facts = [
        ElementMeasurementFact(
            measurement_id=f"mf-b3-{field}",
            work_item_id=item.work_item_id,
            field=field,  # type: ignore[arg-type]
            value=250.0 if field != "span_length" else 4000.0,
            unit="mm",
            source_method="written_dimension",
            verification_status=verification_status,  # type: ignore[arg-type]
            evidence_refs=["ev-label-b3-1"],
            source_page_indices=[50],
        )
    ]
    return item.model_copy(update={"measurement_facts": facts}, deep=True)


# ── Trigger (engine gap only) ────────────────────────────────────────────────


def test_engine_confident_never_triggers_ai():
    item = make_dimensioned_item()
    trigger, reason = should_trigger_ai_assist(item)
    assert trigger is None
    assert "confident" in reason
    assert build_ai_assist_decision(item) is None


def test_unknown_category_triggers_abstain():
    item = make_item(category="unknown", code=None, label="XYZ")
    trigger, reason = should_trigger_ai_assist(item)
    assert trigger == "abstain"
    assert "unknown" in reason
    decision = build_ai_assist_decision(item)
    assert decision is not None
    assert decision.trigger == "abstain"
    assert set(decision.allowed_fields) == set(QUANTITY_ALLOWED_FIELDS)


def test_missing_information_triggers_abstain():
    item = make_item(
        missing_information=["legend_or_schedule_definition", "type_dimensions"],
    )
    trigger, _ = should_trigger_ai_assist(item)
    assert trigger == "abstain"


def test_conflict_triggers_ambiguous():
    item = make_item(conflict_ids=["conflict-1"])
    trigger, _ = should_trigger_ai_assist(item)
    assert trigger == "ambiguous"


def test_conflicting_count_authority_triggers_ambiguous():
    item = make_item(count_authority="conflicting")
    trigger, _ = should_trigger_ai_assist(item)
    assert trigger == "ambiguous"


def test_no_evidence_means_no_ai_decision():
    item = make_item(category="unknown", code=None, label="XYZ", evidence_refs=[])
    decision = build_ai_assist_decision(item)
    assert decision is None  # safety-net area takes over, not AI


# ── Field restriction + evidence requirement (3-layer validation) ────────────


def make_decision() -> AiAssistDecision:
    return AiAssistDecision(
        trigger="abstain",
        deterministic_reason="engine category is unknown",
        allowed_fields=QUANTITY_ALLOWED_FIELDS,
        evidence_refs=("ev-label-k1-1",),
    )


def test_forbidden_final_number_fields_rejected():
    decision = make_decision()
    proposal = {
        "category": "column",
        "label": "Kolom Beton Bertulang K1",
        "evidence_refs": ["ev-label-k1-1"],
        "count": 12,
        "volume": 2.16,
        "result": 2.16,
        "source_authority": "core_engine",
    }
    result = validate_quantity_proposal(
        decision=decision,
        proposal=proposal,
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is False
    assert "forbidden final-number fields" in result["reason"]
    assert set(result["fields"]) == {"count", "volume", "result", "source_authority"}


def test_proposal_without_evidence_rejected():
    decision = make_decision()
    result = validate_quantity_proposal(
        decision=decision,
        proposal={"category": "column", "label": "Kolom K1"},
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is False
    assert "evidence_refs is required" in result["reason"]


def test_unknown_evidence_rejected():
    decision = make_decision()
    result = validate_quantity_proposal(
        decision=decision,
        proposal={"category": "column", "label": "Kolom K1", "evidence_refs": ["ev-fabricated-99"]},
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is False
    assert "unknown evidence" in result["reason"]


def test_valid_proposal_accepted():
    decision = make_decision()
    proposal = {
        "category": "column",
        "label": "Kolom Beton Bertulang K1",
        "type_code": "K1",
        "dimensions_display": "400 × 600 mm",
        "location": "Lantai 1",
        "evidence_refs": ["ev-label-k1-1"],
    }
    result = validate_quantity_proposal(
        decision=decision,
        proposal=proposal,
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is True


def test_bad_type_code_grammar_rejected():
    decision = make_decision()
    result = validate_quantity_proposal(
        decision=decision,
        proposal={"category": "column", "type_code": "KolomK1!!", "evidence_refs": ["ev-label-k1-1"]},
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is False
    assert "type_code does not match" in result["reason"]


def test_category_outside_taxonomy_rejected():
    decision = make_decision()
    result = validate_quantity_proposal(
        decision=decision,
        proposal={"category": "mystery_element", "evidence_refs": ["ev-label-k1-1"]},
        supplied_evidence_refs={"ev-label-k1-1"},
    )
    assert result["valid"] is False
    assert "not in the engine taxonomy vocabulary" in result["reason"]


def test_sanitize_strips_forbidden_fields():
    from app.drawing_intelligence.quantities_ai_assist import sanitize_proposal

    cleaned = sanitize_proposal(
        {"category": "column", "evidence_refs": ["ev-1"], "count": 5, "result": 3.0}
    )
    assert "count" not in cleaned
    assert "result" not in cleaned
    assert cleaned["category"] == "column"


# ── Model routing: deepseek-v4-flash ONLY ────────────────────────────────────


def test_only_deepseek_v4_flash_model_allowed():
    assert SUPPORTED_ASSIST_MODELS == {"deepseek-v4-flash"}
    assert QUANTITY_ASSIST_MODEL == "deepseek-v4-flash"
    with pytest.raises(ValueError, match="supports ONLY deepseek-v4-flash"):
        QuantitiesAiAssistClient(api_key="fake-key", model="deepseek-v4-pro")
    with pytest.raises(ValueError, match="supports ONLY deepseek-v4-flash"):
        QuantitiesAiAssistClient(api_key="fake-key", model="gemini-2.5-flash")


def test_client_never_leaks_key_in_repr():
    client = QuantitiesAiAssistClient(api_key="supersecret-value-12345")
    rendered = repr(client)
    assert "supersecret-value-12345" not in rendered
    assert "<redacted>" in rendered


def test_client_from_env_reads_only_paax_test_api_key(monkeypatch):
    monkeypatch.delenv(PAAX_API_KEY_ENV, raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-secret")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-secret")
    assert QuantitiesAiAssistClient.from_env() is None  # no PAAX key -> graceful None

    monkeypatch.setenv(PAAX_API_KEY_ENV, "paax-fake-key-123")
    client = QuantitiesAiAssistClient.from_env()
    assert client is not None
    assert client.model == QUANTITY_ASSIST_MODEL


# ── Client transport (mocked, offline) ───────────────────────────────────────


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200):
        self._payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args: Any) -> bool:
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


def fake_urlopen_factory(payload: dict, status: int = 200, calls: list | None = None):
    def urlopen(req, timeout=30.0):  # noqa: ANN001
        if calls is not None:
            calls.append(req)
        if status >= 400:
            import urllib.error

            raise urllib.error.HTTPError(req.full_url, status, "err", {}, None)
        return FakeResponse(payload, status)

    return urlopen


def test_client_parses_valid_json_response():
    payload = {
        "choices": [{"message": {"content": json.dumps({"category": "column"})}}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 4},
    }
    client = QuantitiesAiAssistClient(
        api_key="fake", urlopen=fake_urlopen_factory(payload)
    )
    result = client.generate_json(system_prompt="s", user_prompt="u")
    assert result == {"category": "column"}


def test_client_handles_http_error_gracefully():
    client = QuantitiesAiAssistClient(
        api_key="fake", urlopen=fake_urlopen_factory({}, status=504)
    )
    assert client.generate_json(system_prompt="s", user_prompt="u") is None


def test_client_handles_invalid_json_gracefully():
    class BadResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args: Any) -> bool:
            return False

        def read(self) -> bytes:
            return b"not json at all"

    client = QuantitiesAiAssistClient(api_key="fake", urlopen=lambda req, timeout=30.0: BadResponse())
    assert client.generate_json(system_prompt="s", user_prompt="u") is None


def test_client_retries_once_then_fails():
    calls: list = []

    def failing_urlopen(req, timeout=30.0):  # noqa: ANN001
        calls.append(req)
        import urllib.error

        raise urllib.error.URLError("boom")

    client = QuantitiesAiAssistClient(api_key="fake", urlopen=failing_urlopen, sleep=lambda _s: None)
    assert client.generate_json(system_prompt="s", user_prompt="u") is None
    assert len(calls) == 2  # initial + 1 retry (worker retry contract)


# ── Few-shot golden set ──────────────────────────────────────────────────────


def test_load_golden_set_only_engine_validated():
    items = load_golden_set(GOLDEN_FIXTURE)
    assert len(items) == 13
    assert all(item["validation"] == "engine" for item in items)


def test_build_few_shot_examples_selects_3_to_5_per_category():
    items = load_golden_set(GOLDEN_FIXTURE)
    columns = build_few_shot_examples(items, "column", limit=5)
    assert 3 <= len(columns) <= 5
    assert all(example["category"] == "column" for example in columns)
    beams = build_few_shot_examples(items, "beam", limit=5)
    assert 3 <= len(beams) <= 5
    foundations = build_few_shot_examples(items, "foundation", limit=5)
    assert len(foundations) == 3


def test_build_few_shot_section_contains_real_engine_facts():
    items = load_golden_set(GOLDEN_FIXTURE)
    section = build_few_shot_section(items)
    assert "Kategori 'column'" in section
    assert "Kolom Beton Bertulang K1" in section
    assert "Kategori 'foundation'" in section
    assert "Pondasi Footplat PC1" in section


# ── Orchestrator ──────────────────────────────────────────────────────────────


class FakeProposalClient:
    def __init__(self, payloads: dict[str, dict] | None = None):
        self.payloads = payloads or {}
        self.calls: list[str] = []

    def generate_json(self, *, system_prompt: str, user_prompt: str, operation_name: str = ""):
        self.calls.append(operation_name)
        key = operation_name.split(":")[-1]
        return self.payloads.get(key, {"category": "column", "label": "Kolom K1", "evidence_refs": ["ev-label-k1-1"]})


def test_orchestrator_skips_confident_items():
    items = [make_dimensioned_item(), make_dimensioned_item()]
    client = FakeProposalClient()
    result = run_quantities_ai_assist(items, golden_items=[], client=client)
    assert result.skipped_confident_count == 2
    assert result.called_count == 0
    assert result.proposals == []
    assert result.audits == []


def test_orchestrator_proposes_only_for_triggered_and_audits_unapproved(tmp_path):
    gap_item = make_item(category="unknown", code=None, label="GORDING-7", evidence_refs=["ev-label-g1-1"])
    confident_item = make_dimensioned_item()
    ledger = AppendOnlyProposalAuditLog(tmp_path / "audit.jsonl")
    client = FakeProposalClient(
        {gap_item.work_item_id: {"category": "beam", "label": "Balok Beton Bertulang G1", "type_code": "G1", "evidence_refs": ["ev-label-g1-1"]}}
    )
    result = run_quantities_ai_assist(
        [gap_item, confident_item],
        golden_items=load_golden_set(GOLDEN_FIXTURE),
        client=client,
        audit_log=ledger,
    )
    assert result.skipped_confident_count == 1
    assert result.triggered_count == 1
    assert result.called_count == 1
    assert result.proposed_count == 1
    assert result.rejected_count == 0
    assert len(result.proposals) == 1
    proposal = result.proposals[0]
    assert proposal.proposal["category"] == "beam"
    assert proposal.audit.approval_state == "unapproved"
    assert proposal.audit.outcome == "needs_review"
    # Append-only ledger persisted and verifiable
    assert ledger.verify() is True
    assert "category" not in {f for f in proposal.proposal if f in QUANTITY_FORBIDDEN_FIELDS}


def test_orchestrator_rejects_proposal_with_fabricated_evidence(tmp_path):
    gap_item = make_item(category="unknown", code=None, label="XYZ", evidence_refs=["ev-real-1"])
    ledger = AppendOnlyProposalAuditLog(tmp_path / "audit.jsonl")
    client = FakeProposalClient(
        {gap_item.work_item_id: {"category": "column", "evidence_refs": ["ev-fake-999"]}}
    )
    result = run_quantities_ai_assist(
        [gap_item], golden_items=[], client=client, audit_log=ledger
    )
    assert result.proposed_count == 0
    assert result.rejected_count == 1
    assert result.audits[0].outcome == "rejected"
    assert result.audits[0].approval_state == "unapproved"


def test_orchestrator_records_provider_error_honestly(tmp_path):
    gap_item = make_item(category="unknown", code=None, label="XYZ", evidence_refs=["ev-real-1"])
    ledger = AppendOnlyProposalAuditLog(tmp_path / "audit.jsonl")

    class BrokenClient:
        def generate_json(self, **kwargs):
            return None

    result = run_quantities_ai_assist(
        [gap_item], golden_items=[], client=BrokenClient(), audit_log=ledger
    )
    assert result.error_count == 1
    assert result.proposed_count == 0
    assert result.audits[0].outcome == "provider_error"
    assert result.audits[0].approval_state == "unapproved"
    assert ledger.verify() is True


def test_orchestrator_without_client_records_unavailable(tmp_path):
    gap_item = make_item(category="unknown", code=None, label="XYZ", evidence_refs=["ev-real-1"])
    result = run_quantities_ai_assist([gap_item], golden_items=[], client=None)
    assert result.triggered_count == 1
    assert result.audits[0].outcome == "provider_error"
    assert result.audits[0].approval_state == "unapproved"


def test_build_assist_context_contains_bbox_evidence():
    item = make_item(category="unknown", code=None, label="XYZ", page_indices=[38], evidence_refs=["ev-label-pc1-1"])
    context = build_assist_context(
        item,
        {
            38: {
                "title": "DENAH FOOTPLAT",
                "discipline": "structure",
                "drawing_type": "foundation_plan",
                "level": "foundation",
                "texts": [{"text": "PC1", "bbox": {"x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.4}}],
            }
        },
    )
    assert context["evidence_refs"] == ["ev-label-pc1-1"]
    assert context["pages"][0]["title"] == "DENAH FOOTPLAT"
    assert context["pages"][0]["texts"][0]["bbox"]["x0"] == 0.1


def test_build_assist_prompt_contains_few_shot_and_forbidden_rules():
    items = load_golden_set(GOLDEN_FIXTURE)
    decision = make_decision()
    context = build_assist_context(make_item(category="unknown", code=None, label="XYZ"), {})
    system_prompt, user_prompt = build_assist_prompt(
        decision=decision,
        context=context,
        few_shot_section=build_few_shot_section(items),
    )
    assert "DILARANG mengisi count, volume, result, source_authority" in system_prompt
    assert "CONTOH GOLDEN SET" in user_prompt
    assert "FIELD YANG DIIZINKAN" in user_prompt
    assert "Kolom Beton Bertulang K1" in user_prompt


# ── "Perlu konfirmasi" area (Master Plan §4.5) ───────────────────────────────


def test_dimensioned_coded_item_is_not_confirmation():
    item = make_dimensioned_item()  # beam B2 with dimensions
    assert is_perlu_konfirmasi(item) is False
    assert confirmation_status_for(item) in {"belum_didukung", "belum_dihitung"}


def test_uncoded_unknown_item_is_confirmation_with_reason():
    item = make_item(category="unknown", code=None, label="XYZ", evidence_refs=["ev-real-1"])
    assert is_perlu_konfirmasi(item) is True
    reasons = confirmation_reasons_for(item)
    assert any("tidak ada kode elemen terdeteksi" in reason for reason in reasons)
    assert any("dimensi tidak tersedia" in reason for reason in reasons)
    assert confirmation_status_for(item) == "perlu_konfirmasi"


def test_coded_but_not_dimensioned_is_confirmation():
    item = make_item(category="column", code="K1", label="K1", attributes={"level": "L1"})
    assert is_perlu_konfirmasi(item) is True
    assert any("dimensi tidak tersedia" in reason for reason in confirmation_reasons_for(item))


def test_engine_verified_fact_dimensions_are_connected_not_confirmation():
    # C2-4: dimensions from engine-verified measurement facts (no attributes
    # dimensions display) count as connected — the item leaves the
    # confirmation area and becomes "belum dihitung"/"belum didukung".
    item = make_fact_dimensioned_item(verification_status="engine_verified")
    assert is_perlu_konfirmasi(item) is False
    assert confirmation_status_for(item) in {"belum_didukung", "belum_dihitung"}
    assert not any("dimensi tidak tersedia" in reason for reason in confirmation_reasons_for(item))


def test_human_verified_fact_dimensions_are_connected_not_confirmation():
    item = make_fact_dimensioned_item(verification_status="human_verified", field="span_length")
    assert is_perlu_konfirmasi(item) is False
    assert not any("dimensi tidak tersedia" in reason for reason in confirmation_reasons_for(item))


def test_unverified_fact_dimensions_are_still_confirmation():
    # Defensive: candidate facts (not yet verified) do NOT count as connected —
    # otherwise the confirmation area would silently trust unverified numbers.
    item = make_fact_dimensioned_item(verification_status="candidate")
    assert is_perlu_konfirmasi(item) is True
    assert any("dimensi tidak tersedia" in reason for reason in confirmation_reasons_for(item))


def test_conflict_item_is_confirmation():
    item = make_item(
        category="beam", code="B2", label="B2",
        attributes={"level": "L1", "dimensions": {"width": 250, "depth": 500, "unit": "mm"}},
        conflict_ids=["conflict-1"],
    )
    # Fully classified+dimensioned but conflicting sources -> confirmation area
    assert is_perlu_konfirmasi(item) is True
    assert any("konflik antar sumber" in reason for reason in confirmation_reasons_for(item))


def test_unknown_but_code_observed_in_label_reports_code_reason():
    item = make_item(category="unknown", code=None, label="WF1", evidence_refs=["ev-real-1"])
    reasons = confirmation_reasons_for(item)
    assert any("kode elemen 'WF1' terdeteksi pada label" in reason for reason in reasons)


def test_confirmation_ratio_target_10_percent():
    items = [
        # 27 confident/dimensioned items (not confirmation)
        make_dimensioned_item() for _ in range(27)
    ]
    # 3 genuine confirmation items
    items.extend(
        [
            make_item(category="unknown", code=None, label="ZZ1", evidence_refs=["ev-1"]),
            make_item(category="unknown", code=None, label="ZZ2", evidence_refs=["ev-2"]),
            make_item(category="column", code="K1", label="K1", attributes={"level": "L1"}),
        ]
    )
    measurement = measure_confirmation_area(items, target_ratio=0.10)
    assert measurement["total_items"] == 30
    assert measurement["needs_confirmation_count"] == 3
    assert measurement["needs_confirmation_ratio"] == pytest.approx(0.10)
    assert measurement["within_target"] is True
    assert len(measurement["items"]) == 3
    for entry in measurement["items"]:
        assert entry["reasons"]


def test_confirmation_ratio_exceeding_target_reports_false():
    items = [
        make_item(category="unknown", code=None, label=f"U{i}", evidence_refs=[f"ev-{i}"])
        for i in range(3)
    ] + [make_dimensioned_item() for _ in range(7)]
    measurement = measure_confirmation_area(items, target_ratio=0.10)
    assert measurement["within_target"] is False
    assert measurement["needs_confirmation_ratio"] == pytest.approx(0.3)


def test_statuses_never_conflated():
    # "belum dihitung": coded + dimensioned + missing physical count verification
    counted = make_dimensioned_item()
    counted = counted.model_copy(
        update={
            "missing_information": ["physical_count_verification", "human verification of physical-instance count"],
        }
    )
    assert confirmation_status_for(counted) == "belum_dihitung"
    assert is_perlu_konfirmasi(counted) is False
    # "belum didukung": coded + dimensioned + no count missing markers
    supported = make_dimensioned_item()
    assert confirmation_status_for(supported) == "belum_didukung"
    assert is_perlu_konfirmasi(supported) is False
