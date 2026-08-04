"""Quantities AI-assist — Master Plan §4.4 (proposal-only, never-final).

Engine-first, AI-assist kedua: AI is invoked ONLY on measured engine gaps
(abstain / ambiguous / missing_information) and every proposal is a bounded,
evidence-carrying, audited proposal that can never become a final number.

Contract (Master Plan §4.4):
- Trigger: engine `abstain` / `ambiguous` / `needs_review` / `missing_information != []`.
- Input: page context (title, discipline, texts with bbox), engine results,
  plus 3–5 real few-shot examples per category from the K0 golden set.
- Output: strict JSON proposal limited to `allowed_fields`.
- 3 validation layers:
    1. field restriction — AI may fill category/label/type_code/dimensions_display/location;
       NEVER count, volume, result, source_authority (final numbers stay engine-owned).
    2. evidence requirement — every proposal MUST carry `evidence_refs` (bbox + page
       from JSON-1); unknown refs are auto-rejected.
    3. audit trail — every proposal is recorded in `AiProposalAudit`
       with `approval_state="unapproved"`; never `source_authority=core_engine`.
- Model: deepseek-v4-flash ONLY (Owner directive). API key is read from
  `PAAX_TEST_API_KEY` (00_governance/.env) and is NEVER logged or displayed.

Safety-net area (Master Plan §4.5) is implemented here too: explicit
"perlu konfirmasi" criteria with documented reasons and a ≤10% target metric.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal, Mapping
from urllib import error, request

from .models import WorkItemCandidate
from .taxonomy import (
    _DIGITLESS_CODE_CATEGORY,
    dimensions_text,
    extract_item_code,
)
from app.perception.ai_assist.contracts import (
    AiAssistDecision,
    AiProposalAudit,
    validate_bounded_proposal,
)

# ── Contract constants (Master Plan §4.4) ─────────────────────────────────────

QUANTITY_ASSIST_MODEL = "deepseek-v4-flash"
SUPPORTED_ASSIST_MODELS = frozenset({"deepseek-v4-flash"})
PAAX_API_KEY_ENV = "PAAX_TEST_API_KEY"
# OpenAI-compatible chat-completions endpoint for the PAAX opencode-go
# provider.  The PAAX_TEST_API_KEY is issued for opencode.ai/zen/go/v1, so the
# legacy api.deepseek.com endpoint would 401 — keep this URL in sync with the
# key (00_governance/.env).  Model stays deepseek-v4-flash ONLY (Owner
# directive, Master Plan §4.4).
DEFAULT_API_URL = "https://opencode.ai/zen/go/v1/chat/completions"
# opencode.ai sits behind Cloudflare, which returns HTTP 403 Error 1010
# ("browser_signature_banned") for the default Python-urllib user-agent.
# A curl-style UA passes the WAF (verified: probe 200 OK, deepseek-v4-flash).
DEFAULT_USER_AGENT = "curl/8.5.0"
PROMPT_VERSION = "quantities-assist-v1"
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 1  # worker retry contract: max 1 retry per dispatch

# Field restriction: AI may fill ONLY these.  count/volume/result/source_authority
# are forbidden — final numbers are produced exclusively by the engine/Core Engine.
QUANTITY_ALLOWED_FIELDS = (
    "category",
    "label",
    "type_code",
    "dimensions_display",
    "location",
    "evidence_refs",
)
QUANTITY_FORBIDDEN_FIELDS = (
    "count",
    "volume",
    "result",
    "source_authority",
    "sourceAuthority",
    "final_quantity",
    "occurrence_count",
    "verified_physical_count",
    "result_display",
)

# Deterministic engine gap markers (Master Plan §4.4 trigger).
_ABSTAIN_MISSING_MARKERS = (
    "legend_or_schedule_definition",
    "type_dimensions",
    "level",
)
_AMBIGUOUS_MARKERS = ("conflicting",)

# Few-shot sampling (Master Plan §4.4: 3–5 real golden examples per category).
MIN_FEW_SHOT_PER_CATEGORY = 3
MAX_FEW_SHOT_PER_CATEGORY = 5

# Item-code grammar (Master Plan §4.2 L4).
_CODE_GRAMMAR = re.compile(r"^[A-Z]{1,5}-?\d{1,3}[A-Z]?$")

# Cycle-002 P1: digitless element type codes the engine accepts (BL,
# PEDESTAL, RAFTER, WF, CU, CO, CG, PAH, KUSEN, …).  The AI validator must
# never accept a code the engine rejects, so the single source of truth is
# the engine's taxonomy `_DIGITLESS_CODE_CATEGORY` — not a duplicated list.
_REGISTERED_DIGITLESS_CODES = frozenset(_DIGITLESS_CODE_CATEGORY)

# Cycle-002 C2-4: dimensions that count as "connected" for an item — the same
# set the M4 dimension-linking metric uses.  An item whose engine/human
# verified facts carry one of these fields has connected dimensions, so it is
# NOT "dimensi tidak tersedia" material for the confirmation area.
_DIMENSION_FIELDS = frozenset(
    {"width", "depth", "height", "span_length", "length", "thickness"}
)

# Canonical vocabulary for AI proposals — the engine's taxonomy registry keys.
# Cycle-002 P1: completed for parity with the engine _REGISTRY — kuda_kuda,
# trekstang, water_tank, concrete_grade, floor_finish, door_frame (kusen) were
# missing; "roof"/"stair" were never registry keys and are removed so the AI
# can only propose categories the engine can actually classify.
_ALLOWED_CATEGORY_VOCABULARY = frozenset(
    {
        "column", "beam", "slab", "foundation", "sloof", "wall",
        "door", "window", "door_frame", "door_window_assembly", "ceiling_type",
        "steel_profile", "gording", "kuda_kuda", "pipe", "trekstang",
        "floor_finish", "concrete_grade", "water_tank",
        "lighting_fixture", "electrical_fixture",
        "fire_safety_fixture", "hvac_fixture", "plumbing_fixture",
    }
)

# ── Small dataclasses ─────────────────────────────────────────────────────────

AssistTriggerKind = Literal["abstain", "ambiguous"]


@dataclass(frozen=True)
class QuantitiesProposal:
    work_item_id: str
    trigger: AssistTriggerKind
    deterministic_reason: str
    proposal: dict[str, Any]
    validation: dict[str, Any]
    model: str
    prompt_version: str
    case_id: str
    tokens: dict[str, int]
    cost_usd: float
    latency_ms: int
    audit: AiProposalAudit


@dataclass
class QuantitiesAssistResult:
    proposals: list[QuantitiesProposal] = field(default_factory=list)
    audits: list[AiProposalAudit] = field(default_factory=list)
    triggered_count: int = 0
    called_count: int = 0
    proposed_count: int = 0
    rejected_count: int = 0
    error_count: int = 0
    skipped_confident_count: int = 0

    @property
    def metrics(self) -> dict[str, Any]:
        return {
            "ai_triggered_count": self.triggered_count,
            "ai_called_count": self.called_count,
            "ai_proposed_count": self.proposed_count,
            "ai_rejected_count": self.rejected_count,
            "ai_provider_error_count": self.error_count,
            "ai_skipped_confident_count": self.skipped_confident_count,
            "ai_proposals_all_unapproved": all(
                audit.approval_state == "unapproved" for audit in self.audits
            ),
        }


# ── Key isolation + model routing (deepseek-v4-flash ONLY) ───────────────────


def _paax_api_key_only() -> str:
    """Read ONLY PAAX_TEST_API_KEY (00_governance/.env). Rejects all fallbacks.

    Never logs or returns the key in an exception message.
    """
    key = os.getenv(PAAX_API_KEY_ENV, "").strip()
    if not key:
        raise RuntimeError(
            f"{PAAX_API_KEY_ENV} is required for quantities AI-assist. "
            "The key lives in 00_governance/.env and must never be logged."
        )
    return key


def _as_non_negative_int(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(parsed, 0)


def _usage_from_response(payload: dict[str, Any]) -> dict[str, int]:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        usage = {}
    return {
        "prompt": _as_non_negative_int(usage.get("prompt_tokens", 0)),
        "completion": _as_non_negative_int(usage.get("completion_tokens", 0)),
        "cached": _as_non_negative_int(usage.get("cached_tokens", 0)),
    }


def _content_payload(response_payload: dict[str, Any]) -> dict[str, Any]:
    try:
        choices = response_payload.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, dict):
                    return content
                if isinstance(content, str):
                    text = content.strip()
                    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
                    if fenced:
                        text = fenced.group(1).strip()
                    parsed = json.loads(text)
                    if isinstance(parsed, dict):
                        return parsed
    except (AttributeError, TypeError, json.JSONDecodeError):
        return {}
    return {}


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {408, 425, 429} or 500 <= status_code <= 599


class QuantitiesAiAssistClient:
    """OpenAI-compatible chat-completions client for quantities AI-assist.

    - model alias whitelist: deepseek-v4-flash ONLY.
    - graceful degradation: every failure returns None (caller must treat None
      as 'no AI proposal', never crash the engine pipeline).
    - retry: max 1 (worker retry contract).
    - the API key is never included in exceptions or string output.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str = QUANTITY_ASSIST_MODEL,
        api_url: str = DEFAULT_API_URL,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        urlopen: Callable[..., Any] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = DEFAULT_MAX_RETRIES,
        usage_logger: Callable[..., Any] | None = None,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        if model not in SUPPORTED_ASSIST_MODELS:
            raise ValueError(
                f"quantities AI-assist supports ONLY deepseek-v4-flash, got '{model}'"
            )
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        if not api_key or not api_key.strip():
            raise ValueError("api_key is required")
        self._api_key = api_key.strip()
        self.model = model
        self.api_url = api_url
        self.timeout_seconds = timeout_seconds
        self._urlopen = urlopen or request.urlopen
        self._clock = clock
        self._sleep = sleep
        self.max_retries = max_retries
        self._usage_logger = usage_logger
        self.user_agent = user_agent

    @classmethod
    def from_env(
        cls, usage_logger: Callable[..., Any] | None = None
    ) -> "QuantitiesAiAssistClient | None":
        """Reads ONLY PAAX_TEST_API_KEY. Returns None when absent (graceful)."""
        try:
            api_key = _paax_api_key_only()
        except RuntimeError:
            return None
        return cls(api_key=api_key, usage_logger=usage_logger)

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        operation_name: str = "quantities_assist:propose",
    ) -> dict[str, Any] | None:
        started = self._clock()
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        req = request.Request(
            self.api_url,
            data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "User-Agent": self.user_agent,
            },
            method="POST",
        )
        try:
            response_payload = self._request_with_retry(req)
        except Exception:
            self._log_usage(operation_name=operation_name, success=False, latency_ms=0, started=started)
            return None
        payload = _content_payload(response_payload)
        if not payload:
            self._log_usage(operation_name=operation_name, success=False, latency_ms=0, started=started)
            return None
        self._log_usage(
            operation_name=operation_name,
            success=True,
            latency_ms=max(0, int(round((self._clock() - started) * 1000))),
            started=started,
            tokens=_usage_from_response(response_payload),
        )
        return payload

    def _request_with_retry(self, req: request.Request) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with self._urlopen(req, timeout=self.timeout_seconds) as response:
                    status_code = int(getattr(response, "status", getattr(response, "code", 200)))
                    raw_body = response.read()
                if status_code < 200 or status_code >= 300:
                    raise RuntimeError(f"provider returned HTTP {status_code}")
                parsed = json.loads(raw_body.decode("utf-8"))
                if not isinstance(parsed, dict):
                    raise RuntimeError("provider response must be a JSON object")
                return parsed
            except error.HTTPError as exc:
                if not _is_retryable_status(int(exc.code)) or attempt >= self.max_retries:
                    raise
                last_error = exc
            except (error.URLError, TimeoutError, OSError, RuntimeError, ValueError) as exc:
                if attempt >= self.max_retries:
                    raise
                last_error = exc
            if attempt < self.max_retries and self._sleep is not None:
                self._sleep(0.5 * (2 ** attempt))
        raise RuntimeError(f"provider request failed after {self.max_retries + 1} attempts") from last_error

    def _log_usage(self, *, operation_name: str, success: bool, latency_ms: int, started: float, tokens: dict[str, int] | None = None) -> None:
        if self._usage_logger is None:
            return
        try:
            self._usage_logger(
                operation=operation_name,
                success=success,
                latency_ms=latency_ms,
                tokens=tokens or {},
            )
        except Exception:
            pass

    def __repr__(self) -> str:
        # NEVER include the API key.
        return (
            f"QuantitiesAiAssistClient(model={self.model!r}, "
            f"api_url={self.api_url!r}, api_key=<redacted>)"
        )


# ── Few-shot golden set (Master Plan §4.4: real golden examples) ─────────────


def load_golden_set(path: str | Path) -> list[dict[str, Any]]:
    """Load the K0 golden set artifact (engine-validated, 0% AI)."""
    golden_path = Path(path)
    if not golden_path.exists():
        return []
    payload = json.loads(golden_path.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return [
        item for item in items
        if isinstance(item, dict) and item.get("validation") == "engine"
    ]


def build_few_shot_examples(
    golden_items: list[dict[str, Any]],
    category: str,
    *,
    limit: int = MAX_FEW_SHOT_PER_CATEGORY,
) -> list[dict[str, Any]]:
    """Select 3–5 engine-validated golden examples for one category.

    Only deterministic engine facts enter the prompt: code, canonical name,
    level, dimensions display, unit, label, evidence_refs. No AI-derived value.
    """
    matching = [
        item for item in golden_items
        if str(item.get("category") or "") == category
    ]
    ordered = sorted(
        matching,
        key=lambda item: (
            str(item.get("code") or ""),
            str(item.get("level") or ""),
            str(item.get("page_index") or ""),
        ),
    )
    return [
        {
            "code": item.get("code"),
            "canonical_name": item.get("canonical_name"),
            "category": item.get("category"),
            "level": item.get("level"),
            "dimensions": item.get("dimensions"),
            "unit": item.get("unit"),
            "label": item.get("label"),
            "evidence_refs": item.get("evidence_refs", []),
        }
        for item in ordered[: max(MIN_FEW_SHOT_PER_CATEGORY, min(limit, MAX_FEW_SHOT_PER_CATEGORY))]
    ]


def build_few_shot_section(
    golden_items: list[dict[str, Any]],
    *,
    per_category: int = MAX_FEW_SHOT_PER_CATEGORY,
) -> str:
    """Build the few-shot prompt block from the golden set."""
    seen_categories: list[str] = []
    for item in golden_items:
        category = str(item.get("category") or "")
        if category and category not in seen_categories:
            seen_categories.append(category)
    blocks: list[str] = []
    for category in seen_categories:
        examples = build_few_shot_examples(golden_items, category, limit=per_category)
        if not examples:
            continue
        rendered = [json.dumps(ex, ensure_ascii=False) for ex in examples]
        blocks.append(
            f"Kategori '{category}' ({len(rendered)} contoh terverifikasi engine):\n"
            + "\n".join(rendered)
        )
    if not blocks:
        return "Tidak ada contoh golden set tersedia untuk kategori ini."
    return "\n\n".join(blocks)


# ── Trigger (engine gap only) ─────────────────────────────────────────────────


def should_trigger_ai_assist(item: WorkItemCandidate) -> tuple[AssistTriggerKind | None, str]:
    """Return (trigger, deterministic_reason) — AI is called ONLY on engine gaps.

    Cycle-p1p2 P4: the trigger is now IDENTICAL to the confirmation-area
    criteria (Master Plan §4.5). Every item that ENTERS the "perlu konfirmasi"
    area is automatically offered AI-assist — even when the engine recorded no
    `missing_information` marker (batch-07/09 root cause: 6/7 confirmation
    items were never triggered because `missing_information` was empty, even
    though they sat in the confirmation area).

    - "abstain": engine cannot classify (unknown category / missing definition,
      dimension, or level) OR the item meets confirmation-area criteria.
    - "ambiguous": engine found conflicting sources (always confirmation
      material under §4.5(c)).
    - None: engine is confident — AI must NOT be called (metric 8). This is
      exactly the complement of the confirmation area: fully classified +
      coded + dimensioned items (and golden-definition items) are never
      confirmation material, so they are never offered AI.
    """
    if item.category == "unknown":
        return "abstain", "engine category is unknown (no deterministic classification)"
    if item.conflict_ids:
        return "ambiguous", (
            "engine ambiguous: conflict_ids = "
            + json.dumps(sorted(item.conflict_ids), ensure_ascii=False)
        )
    if item.count_authority == "conflicting":
        return "ambiguous", "engine ambiguous: count_authority is conflicting"
    # P4: trigger == confirmation-area criteria.  An item that enters the
    # "perlu konfirmasi" area is a measured engine gap by construction and MUST
    # be offered AI, regardless of whether missing_information was recorded.
    if is_perlu_konfirmasi(item):
        reasons = confirmation_reasons_for(item)
        return "abstain", (
            "engine gap: confirmation-area criteria apply: "
            + "; ".join(reasons)
        )
    missing = set(item.missing_information or [])
    if any(marker in missing for marker in _ABSTAIN_MISSING_MARKERS):
        return "abstain", (
            "engine abstains: missing_information = "
            + json.dumps(sorted(missing), ensure_ascii=False)
        )
    return None, "engine is confident; AI must not be invoked"


def build_ai_assist_decision(item: WorkItemCandidate) -> AiAssistDecision | None:
    trigger, reason = should_trigger_ai_assist(item)
    if trigger is None:
        return None
    evidence = tuple(sorted(set(item.evidence_refs or [])))
    if not evidence:
        # No evidence, no AI proposal: the safety-net area takes over instead.
        return None
    return AiAssistDecision(
        trigger=trigger,
        deterministic_reason=reason,
        allowed_fields=QUANTITY_ALLOWED_FIELDS,
        evidence_refs=evidence,
    )


# ── Context builder (page evidence from JSON-1) ──────────────────────────────


def build_assist_context(
    item: WorkItemCandidate,
    page_contexts: Mapping[int, dict[str, Any]],
) -> dict[str, Any]:
    """Assemble the bounded AI input: page context + engine results + evidence.

    `page_contexts` maps page_index -> {"title", "discipline", "drawing_type",
    "level", "texts": [{"text", "bbox"}], "symbols": [{"text"/"raw", "bbox"}]}
    sourced from JSON-1.

    Cycle-p1p2 P4: the context MUST include the sheet context (title /
    discipline / drawing_type / level) AND the `symbols` observations — not
    just `texts`.  Batch-02 showed the AI misclassified items when the symbol
    legend (e.g. "TL1: LAMPU TL, LED 2x8W") was absent from the prompt; symbols
    carry the same JSON-1 evidence weight as texts and are forwarded verbatim.

    Only deterministic facts are forwarded; numbers from the engine are never
    included as editable fields.
    """
    pages = sorted(set(item.page_indices or []))
    page_blocks: list[dict[str, Any]] = []
    for page_index in pages:
        context = page_contexts.get(page_index, {})
        page_blocks.append(
            {
                "page_index": page_index,
                "page_number": page_index + 1,
                "title": context.get("title"),
                "discipline": context.get("discipline"),
                "drawing_type": context.get("drawing_type"),
                "level": context.get("level"),
                "texts": context.get("texts", [])[:40],
                "symbols": context.get("symbols", [])[:40],
            }
        )
    level = item.attributes.get("level") or None
    return {
        "work_item_id": item.work_item_id,
        "category_engine": item.category,
        "label_observed": item.label,
        "code_engine": item.code,
        "level_engine": None if level == "unknown" else level,
        "dimensions_engine": dimensions_text(item.attributes),
        "missing_information": item.missing_information,
        "conflict_ids": item.conflict_ids,
        "evidence_refs": sorted(set(item.evidence_refs or [])),
        "pages": page_blocks,
    }


# ── 3-layer proposal validation ───────────────────────────────────────────────


def validate_quantity_proposal(
    *,
    decision: AiAssistDecision,
    proposal: dict[str, Any],
    supplied_evidence_refs: set[str],
) -> dict[str, Any]:
    """Layer 1+2+3 validation for a quantities AI proposal.

    1. field restriction (allowed_fields, forbidden final-number fields)
    2. evidence requirement (evidence_refs mandatory, all known)
    3. vocabulary / grammar checks against the engine taxonomy
    """
    forbidden = sorted(set(proposal) & set(QUANTITY_FORBIDDEN_FIELDS))
    if forbidden:
        return {
            "valid": False,
            "reason": "proposal contains forbidden final-number fields",
            "fields": forbidden,
        }
    evidence = proposal.get("evidence_refs", [])
    if not isinstance(evidence, list) or not evidence:
        return {"valid": False, "reason": "evidence_refs is required and must be non-empty"}
    if not supplied_evidence_refs:
        return {"valid": False, "reason": "no engine evidence was supplied for this item"}

    base = validate_bounded_proposal(
        decision=decision,
        proposal=proposal,
        supplied_evidence_refs=supplied_evidence_refs,
        # NOTE: allowed_vocabulary is intentionally NOT passed here — the base
        # validator applies it to every string field (including free-text
        # label/dimensions_display/location).  The category vocabulary check is
        # done explicitly below, so free-text proposal fields stay unrestricted
        # while the classification vocabulary stays engine-owned.
    )
    if not base.get("valid"):
        return base

    category = proposal.get("category")
    if category is not None and str(category) not in _ALLOWED_CATEGORY_VOCABULARY:
        return {
            "valid": False,
            "reason": f"category '{category}' is not in the engine taxonomy vocabulary",
            "field": "category",
            "value": category,
        }
    type_code = proposal.get("type_code")
    if type_code is not None and str(type_code).strip():
        code_value = str(type_code).strip()
        # Cycle-002 P1: the validator accepts a type_code when EITHER the
        # Master Plan §4.2 numeric grammar matches OR the code is a registered
        # engine digitless code (BL/PEDESTAL/RAFTER/WF/CU/CO/CG/PAH/KUSEN…).
        # Free text ("JALAN") still fails because it is not in the engine
        # dictionary — the AI validator and the engine share one source.
        if not (_CODE_GRAMMAR.fullmatch(code_value) or code_value in _REGISTERED_DIGITLESS_CODES):
            return {
                "valid": False,
                "reason": "type_code does not match Master Plan §4.2 L4 grammar",
                "field": "type_code",
                "value": type_code,
            }
    label = proposal.get("label")
    if label is not None and not str(label).strip():
        return {"valid": False, "reason": "label must be a non-empty string when provided"}
    return {"valid": True, "reason": "bounded quantities proposal is reviewable"}


def sanitize_proposal(proposal: dict[str, Any]) -> dict[str, Any]:
    """Hard-strip forbidden final-number fields regardless of validation."""
    return {
        key: value
        for key, value in proposal.items()
        if key not in QUANTITY_FORBIDDEN_FIELDS
    }


# ── Prompt builder ────────────────────────────────────────────────────────────


def build_assist_prompt(
    *,
    decision: AiAssistDecision,
    context: dict[str, Any],
    few_shot_section: str,
) -> tuple[str, str]:
    system_prompt = (
        "Kamu adalah asisten klasifikasi gambar kerja konstruksi di dalam PAAX. "
        "Tugasmu HANYA membuat PROPOSAL klasifikasi untuk item yang gagal "
        "diklasifikasi oleh engine deterministik. "
        "Kamu TIDAK PERNAH menghitung jumlah, volume, atau hasil akhir — angka "
        "final hanya boleh dihasilkan oleh Core Engine. "
        "Kembalikan HANYA satu JSON object dengan field berikut (jangan tambah "
        "field lain): category, label, type_code, dimensions_display, location, "
        "evidence_refs. "
        "category WAJIB salah satu dari vocabulary engine: "
        + ", ".join(sorted(_ALLOWED_CATEGORY_VOCABULARY))
        + ". "
        "type_code mengikuti grammar [A-Z]{1,5}-?\\d{1,3}[A-Z]? atau kode "
        "digitless terdaftar engine (contoh: K1, PC1, WF1, BL, CU, PAH, KUSEN). "
        "JANGAN mengusulkan kode yang tidak terdaftar. "
        "evidence_refs WAJIB berisi minimal satu ref yang disediakan pada konteks "
        "(evidence dari JSON-1: bbox + page). DILARANG mengarang evidence. "
        "DILARANG mengisi count, volume, result, source_authority. "
        "Jika tidak yakin, kembalikan kategori yang paling konsisten dengan konteks "
        "halaman dan contoh golden set."
    )
    user_prompt = (
        "CONTOH GOLDEN SET (diklasifikasi engine, 0% AI):\n"
        + few_shot_section
        + "\n\n"
        + "KONTEKS ITEM DAN HALAMAN (JSON-1):\n"
        + json.dumps(context, ensure_ascii=False, indent=2)
        + "\n\n"
        + f"TRIGGER: {decision.trigger}\n"
        + f"ALASAN DETERMINISTIK: {decision.deterministic_reason}\n"
        + f"FIELD YANG DIIZINKAN: {', '.join(decision.allowed_fields)}\n"
    )
    return system_prompt, user_prompt


# ── Orchestrator ──────────────────────────────────────────────────────────────


def run_quantities_ai_assist(
    work_items: list[WorkItemCandidate],
    *,
    golden_items: list[dict[str, Any]],
    client: QuantitiesAiAssistClient | None,
    page_contexts: Mapping[int, dict[str, Any]] | None = None,
    audit_log: Any | None = None,
    prompt_version: str = PROMPT_VERSION,
    cost_per_million_prompt_tokens: float = 0.0,
    cost_per_million_completion_tokens: float = 0.0,
) -> QuantitiesAssistResult:
    """Run the bounded AI-assist pass over engine work items.

    - Never calls AI when the engine is confident (metric 8).
    - Every call produces an AiProposalAudit (unapproved) — success or failure.
    - Provider errors degrade gracefully (audit outcome=provider_error).
    - Final numbers are never produced here.
    """
    result = QuantitiesAssistResult()
    page_contexts = page_contexts or {}
    few_shot_section = build_few_shot_section(golden_items)

    for item in work_items:
        decision = build_ai_assist_decision(item)
        if decision is None:
            result.skipped_confident_count += 1
            continue
        result.triggered_count += 1

        if client is None:
            result.audits.append(
                _build_audit(
                    decision=decision,
                    item=item,
                    proposal=None,
                    validation={"valid": False, "reason": "client unavailable (no PAAX key)"},
                    outcome="provider_error",
                    tokens={},
                    cost_usd=0.0,
                    latency_ms=0,
                    model=QUANTITY_ASSIST_MODEL,
                    prompt_version=prompt_version,
                )
            )
            continue

        context = build_assist_context(item, page_contexts)
        system_prompt, user_prompt = build_assist_prompt(
            decision=decision,
            context=context,
            few_shot_section=few_shot_section,
        )
        started = time.monotonic()
        payload = client.generate_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            operation_name=f"quantities_assist:{item.work_item_id}",
        )
        latency_ms = max(0, int(round((time.monotonic() - started) * 1000)))
        result.called_count += 1

        if payload is None:
            result.error_count += 1
            audit = _build_audit(
                decision=decision,
                item=item,
                proposal=None,
                validation={"valid": False, "reason": "provider returned no parseable JSON"},
                outcome="provider_error",
                tokens={},
                cost_usd=0.0,
                latency_ms=latency_ms,
                model=QUANTITY_ASSIST_MODEL,
                prompt_version=prompt_version,
            )
            result.audits.append(audit)
            continue

        proposal = sanitize_proposal(payload)
        validation = validate_quantity_proposal(
            decision=decision,
            proposal=proposal,
            supplied_evidence_refs=set(decision.evidence_refs),
        )
        outcome: str = "needs_review" if validation.get("valid") else "rejected"
        tokens = payload.get("_usage_tokens") if isinstance(payload.get("_usage_tokens"), dict) else {}
        audit = _build_audit(
            decision=decision,
            item=item,
            proposal=proposal if validation.get("valid") else None,
            validation=validation,
            outcome=outcome,  # type: ignore[arg-type]
            tokens=tokens,
            cost_usd=_estimate_cost(
                tokens, cost_per_million_prompt_tokens, cost_per_million_completion_tokens
            ),
            latency_ms=latency_ms,
            model=QUANTITY_ASSIST_MODEL,
            prompt_version=prompt_version,
        )
        result.audits.append(audit)
        if audit_log is not None:
            audit_log.append(audit)
        if validation.get("valid"):
            result.proposed_count += 1
            result.proposals.append(
                QuantitiesProposal(
                    work_item_id=item.work_item_id,
                    trigger=decision.trigger,
                    deterministic_reason=decision.deterministic_reason,
                    proposal=proposal,
                    validation=validation,
                    model=QUANTITY_ASSIST_MODEL,
                    prompt_version=prompt_version,
                    case_id=f"quantities:{item.work_item_id}",
                    tokens=tokens,
                    cost_usd=audit.cost_usd,
                    latency_ms=latency_ms,
                    audit=audit,
                )
            )
        else:
            result.rejected_count += 1

    return result


def _build_audit(
    *,
    decision: AiAssistDecision,
    item: WorkItemCandidate,
    proposal: dict[str, Any] | None,
    validation: dict[str, Any],
    outcome: Literal["needs_review", "rejected", "provider_error", "approved", "invalid"],
    tokens: dict[str, int],
    cost_usd: float,
    latency_ms: int,
    model: str,
    prompt_version: str,
) -> AiProposalAudit:
    return AiProposalAudit(
        model=model,
        prompt_version=prompt_version,
        case_id=f"quantities:{item.work_item_id}",
        tokens=tokens,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        proposal=proposal,
        validation=validation,
        outcome=outcome,
        decision=decision,
        approval_state="unapproved",
    )


def _estimate_cost(
    tokens: dict[str, int],
    per_million_prompt: float,
    per_million_completion: float,
) -> float:
    prompt = _as_non_negative_int(tokens.get("prompt", 0))
    completion = _as_non_negative_int(tokens.get("completion", 0))
    return (prompt * per_million_prompt + completion * per_million_completion) / 1_000_000.0


# ── "Perlu konfirmasi" safety-net area (Master Plan §4.5) ────────────────────


def _item_has_connected_dimensions(item: WorkItemCandidate) -> bool:
    """C2-4: an item has connected dimensions when its attributes carry a
    width×depth display OR an engine/human-verified measurement fact covers a
    dimension field (width, depth, height, span_length, length, thickness).

    Mirrors the M4 dimension-linking metric so the confirmation area and the
    dimension metric never disagree about what counts as a connected size.
    """
    if dimensions_text(item.attributes or {}):
        return True
    return any(
        fact.field in _DIMENSION_FIELDS
        and fact.verification_status in {"engine_verified", "human_verified"}
        for fact in item.measurement_facts
    )


def confirmation_status_for(item: WorkItemCandidate) -> str:
    """Explicit status for every non-final item — never conflate categories.

    - "perlu_konfirmasi": genuinely unclassifiable by engine AND AI
      (no code + no dimensions + no evidence / AI abstains).
    - "belum_didukung": fully dimensioned and classified, but no Core Engine
      bridge yet — NOT a confirmation item.
    - "belum_dihitung": clearly coded/classified, but count not yet verified —
      NOT a confirmation item.
    - "ok": engine-confident or already final.
    """
    if is_perlu_konfirmasi(item):
        return "perlu_konfirmasi"
    missing = set(item.missing_information or [])
    if item.category != "unknown" and item.code and _item_has_connected_dimensions(item):
        if any(marker in missing for marker in ("physical_count_verification", "human verification of physical-instance count")):
            return "belum_dihitung"
        return "belum_didukung"
    if item.category != "unknown" and item.code:
        return "belum_dihitung"
    return "perlu_konfirmasi"


def confirmation_reasons_for(item: WorkItemCandidate) -> list[str]:
    """Explicit documented reasons (Master Plan §4.5 criteria a–d)."""
    reasons: list[str] = []
    if item.category == "unknown" or not item.code:
        code_observed = extract_item_code(item.label)
        if code_observed:
            reasons.append(
                f"kode elemen '{code_observed}' terdeteksi pada label tetapi tidak "
                "terklasifikasi deterministik (perlu konfirmasi kategori)."
            )
        else:
            reasons.append("tidak ada kode elemen terdeteksi pada label.")
    if not _item_has_connected_dimensions(item):
        reasons.append("dimensi tidak tersedia atau tidak dapat di-join dari sumber.")
    if item.conflict_ids:
        reasons.append(
            "konflik antar sumber (tabel ≠ denah): "
            + ", ".join(sorted(item.conflict_ids))
            + "."
        )
    if item.count_authority == "conflicting":
        reasons.append("jumlah fisik bertentangan antar sumber.")
    if not item.evidence_refs:
        reasons.append("tidak ada evidence (bbox + page) yang tertaut.")
    missing = set(item.missing_information or [])
    if "legend_or_schedule_definition" in missing:
        reasons.append("definisi tipe belum ditemukan pada legenda/tabel — AI abstain.")
    if "type_dimensions" in missing:
        reasons.append("dimensi tipe belum dipastikan — AI abstain.")
    return list(dict.fromkeys(reasons))


def _is_golden_definition_item(item: WorkItemCandidate) -> bool:
    """R1 definition-resolved item: golden code promoted with JSON-1 evidence.

    Such items are classified and coded by construction (the golden definition
    vocabulary resolved them), so Master Plan §4.5 classifies them as
    "belum dihitung" (coded but not yet counted), never as unclassifiable
    confirmation material — even when their dimensions are not yet joined.
    """
    return (
        (item.attributes or {}).get("definition_resolution") == "golden"
        and item.category != "unknown"
        and bool(item.code)
        and bool(item.evidence_refs)
    )


def is_perlu_konfirmasi(item: WorkItemCandidate) -> bool:
    """Item enters the confirmation area ONLY under §4.5 criteria.

    Order matters: source conflicts (criterion c) are always confirmation
    material even when the item is classified and dimensioned.  Explicitly
    excluded: coded-but-uncounted items ("belum dihitung") and fully-
    dimensioned items without a bridge ("belum didukung").
    """
    if item.conflict_ids or item.count_authority == "conflicting":
        # §4.5(c): konflik antar sumber (tabel ≠ denah) -> confirmation area.
        return True
    if _is_golden_definition_item(item):
        # R1: definition-resolved golden item is coded + classified + evidenced
        # by construction → "belum dihitung", never confirmation material.
        return False
    if item.category != "unknown" and item.code and dimensions_text(item.attributes):
        # Fully classified + dimensioned: NOT confirmation material, even when
        # it is not yet counted or bridged.
        return False
    reasons = confirmation_reasons_for(item)
    return len(reasons) >= 1


def measure_confirmation_area(
    work_items: list[WorkItemCandidate],
    *,
    target_ratio: float = 0.10,
) -> dict[str, Any]:
    """Metric 8: proportion of items in the "perlu konfirmasi" area vs total.

    Target: ≤10% (Master Plan §4.5). Reports per-item explicit reasons and the
    statuses "belum_dihitung" / "belum_didukung" separately so they are never
    conflated with the confirmation area.
    """
    total = len(work_items)
    confirmation_items: list[dict[str, Any]] = []
    belum_dihitung = 0
    belum_didukung = 0
    ok = 0
    for item in work_items:
        status = confirmation_status_for(item)
        if status == "perlu_konfirmasi":
            confirmation_items.append(
                {
                    "work_item_id": item.work_item_id,
                    "label": item.label,
                    "category": item.category,
                    "reasons": confirmation_reasons_for(item),
                }
            )
        elif status == "belum_dihitung":
            belum_dihitung += 1
        elif status == "belum_didukung":
            belum_didukung += 1
        else:
            ok += 1
    ratio = (len(confirmation_items) / total) if total else 0.0
    return {
        "total_items": total,
        "needs_confirmation_count": len(confirmation_items),
        "needs_confirmation_ratio": round(ratio, 4),
        "target_ratio": target_ratio,
        "within_target": ratio <= target_ratio,
        "belum_dihitung_count": belum_dihitung,
        "belum_didukung_count": belum_didukung,
        "ok_count": ok,
        "items": confirmation_items,
    }


__all__ = [
    "DEFAULT_API_URL",
    "DEFAULT_MAX_RETRIES",
    "DEFAULT_TIMEOUT_SECONDS",
    "DEFAULT_USER_AGENT",
    "MIN_FEW_SHOT_PER_CATEGORY",
    "MAX_FEW_SHOT_PER_CATEGORY",
    "PAAX_API_KEY_ENV",
    "PROMPT_VERSION",
    "QUANTITY_ALLOWED_FIELDS",
    "QUANTITY_ASSIST_MODEL",
    "QUANTITY_FORBIDDEN_FIELDS",
    "SUPPORTED_ASSIST_MODELS",
    "QuantitiesAiAssistClient",
    "QuantitiesAssistResult",
    "QuantitiesProposal",
    "build_ai_assist_decision",
    "build_assist_context",
    "build_assist_prompt",
    "build_few_shot_examples",
    "build_few_shot_section",
    "confirmation_reasons_for",
    "confirmation_status_for",
    "is_perlu_konfirmasi",
    "load_golden_set",
    "measure_confirmation_area",
    "run_quantities_ai_assist",
    "sanitize_proposal",
    "should_trigger_ai_assist",
    "validate_quantity_proposal",
]
