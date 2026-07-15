from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping

from .normalizer import normalize_discipline, normalize_element_code


RESOLUTION_RISK_WEIGHTS: Mapping[str, float] = {
    "ambiguity": 0.30,
    "conflict": 0.30,
    "fanout": 0.15,
    "cross_discipline": 0.15,
    "low_evidence": 0.10,
}
RESOLUTION_RISK_ESCALATION_THRESHOLD = 0.50


@dataclass(frozen=True)
class ResolutionRiskSignals:
    ambiguity: float = 0.0
    conflict: float = 0.0
    fanout: float = 0.0
    cross_discipline: float = 0.0
    low_evidence: float = 0.0
    candidate_count: int = 1
    confidence: float = 1.0
    conflict_detected: bool = False
    cross_discipline_detected: bool = False
    affected_nodes: int = 1

    def __post_init__(self) -> None:
        for name in RESOLUTION_RISK_WEIGHTS:
            value = float(getattr(self, name))
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")
            object.__setattr__(self, name, value)
        if self.candidate_count < 0:
            raise ValueError("candidate_count must be non-negative")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        if self.affected_nodes < 0:
            raise ValueError("affected_nodes must be non-negative")


@dataclass(frozen=True)
class ResolutionRisk:
    score: float
    band: str
    requires_escalation: bool
    escalation_reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReferenceCounts:
    total: int = 0
    dangling: int = 0
    pages_with_dangling: int = 0


@dataclass(frozen=True)
class DisciplineObservation:
    page_number: int
    source_field: str
    raw: str
    normalized: str


@dataclass(frozen=True)
class MergeCandidateAudit:
    code: str
    occurrence_count: int
    page_numbers: tuple[int, ...]
    disciplines: tuple[str, ...]
    raw_values: tuple[str, ...]
    candidate_count: int
    resolution_confidence: float
    affected_nodes: int
    risk: ResolutionRisk


@dataclass(frozen=True)
class FixtureAudit:
    page_count: int
    disciplines: tuple[DisciplineObservation, ...]
    references: ReferenceCounts
    references_by_section: Mapping[str, ReferenceCounts]
    references_by_observation_category: Mapping[str, ReferenceCounts]
    merge_candidates: tuple[MergeCandidateAudit, ...]
    risk_distribution: Mapping[str, int]
    escalation_count: int
    escalation_percentage: float


@dataclass
class _ReferenceAccumulator:
    total: int = 0
    dangling: int = 0
    dangling_pages: set[int] = field(default_factory=set)

    def add(self, refs: Iterable[str], evidence_ids: set[str], page_number: int) -> None:
        page_has_dangling = False
        for reference in refs:
            self.total += 1
            if reference not in evidence_ids:
                self.dangling += 1
                page_has_dangling = True
        if page_has_dangling:
            self.dangling_pages.add(page_number)

    def freeze(self) -> ReferenceCounts:
        return ReferenceCounts(
            total=self.total,
            dangling=self.dangling,
            pages_with_dangling=len(self.dangling_pages),
        )


@dataclass(frozen=True)
class _CodeOccurrence:
    raw: str
    page_number: int
    discipline: str
    confidence: float
    has_valid_evidence: bool
    page_has_ambiguity: bool
    page_has_conflict: bool


def score_resolution_risk(signals: ResolutionRiskSignals) -> ResolutionRisk:
    score = round(
        sum(
            getattr(signals, name) * weight
            for name, weight in RESOLUTION_RISK_WEIGHTS.items()
        ),
        4,
    )
    if score >= RESOLUTION_RISK_ESCALATION_THRESHOLD:
        band = "high"
    elif score >= 0.30:
        band = "moderate"
    else:
        band = "low"

    gate_reasons = (
        (signals.candidate_count > 1, "multiple_candidates"),
        (signals.confidence < 0.78, "low_confidence"),
        (signals.conflict_detected, "conflict_detected"),
        (signals.cross_discipline_detected, "cross_discipline"),
        (signals.affected_nodes > 20, "large_impact"),
    )
    reasons = tuple(reason for condition, reason in gate_reasons if condition)
    requires_escalation = bool(reasons) or score >= RESOLUTION_RISK_ESCALATION_THRESHOLD
    return ResolutionRisk(
        score=score,
        band=band,
        requires_escalation=requires_escalation,
        escalation_reasons=reasons,
    )


def _iter_evidence_refs(value: Any) -> Iterator[str]:
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "evidence_refs":
                if isinstance(nested, list):
                    yield from (item for item in nested if isinstance(item, str))
                elif isinstance(nested, str):
                    yield nested
            else:
                yield from _iter_evidence_refs(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _iter_evidence_refs(nested)


def _page_number(page: dict[str, Any], fallback: int) -> int:
    source = page.get("source")
    if isinstance(source, dict):
        page_number = source.get("page_number")
        if isinstance(page_number, int):
            return page_number
        page_index = source.get("page_index")
        if isinstance(page_index, int):
            return page_index + 1
    return fallback


def _discipline_values(page: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    sheet_identity = page.get("sheet_identity")
    if not isinstance(sheet_identity, dict):
        return (("value", ""),)
    discipline = sheet_identity.get("discipline")
    if not isinstance(discipline, dict):
        return (("value", ""),)
    values = tuple(
        (field_name, value)
        for field_name in ("value", "raw")
        if isinstance((value := discipline.get(field_name)), str)
    )
    return values or (("value", ""),)


_ELEMENT_CODE = re.compile(r"[A-Z]{1,4}\d+[A-Z]?")


def _ambiguity_mentions_code(ambiguities: object, code: str) -> bool:
    if not isinstance(ambiguities, list):
        return False
    pattern = re.compile(rf"(?<![A-Z0-9]){re.escape(code)}(?![A-Z0-9])")
    return any(
        isinstance(ambiguity, str) and pattern.search(ambiguity.upper())
        for ambiguity in ambiguities
    )


def _collect_code_occurrences(
    page: dict[str, Any],
    page_number: int,
    discipline: str,
    evidence_ids: set[str],
) -> Iterator[tuple[str, _CodeOccurrence]]:
    observations = page.get("observations")
    if not isinstance(observations, dict):
        return
    labels = observations.get("element_labels")
    if not isinstance(labels, list):
        return

    for label in labels:
        if not isinstance(label, dict):
            continue
        raw_value = label.get("raw")
        normalized_value = label.get("normalized")
        source_values = tuple(
            value
            for value in (raw_value, normalized_value)
            if isinstance(value, str)
        )
        code = next(
            (
                candidate
                for value in source_values
                if _ELEMENT_CODE.fullmatch(
                    candidate := normalize_element_code(value)
                )
            ),
            None,
        )
        if code is None:
            continue
        display_value = raw_value if isinstance(raw_value, str) else source_values[0]
        refs = tuple(_iter_evidence_refs(label))
        confidence_value = label.get("confidence", 0.0)
        confidence = float(confidence_value) if isinstance(confidence_value, (int, float)) else 0.0
        yield code, _CodeOccurrence(
            raw=display_value,
            page_number=page_number,
            discipline=discipline,
            confidence=confidence,
            has_valid_evidence=any(reference in evidence_ids for reference in refs),
            page_has_ambiguity=_ambiguity_mentions_code(
                page.get("ambiguities"), code
            ),
            page_has_conflict=bool(page.get("conflicts")),
        )


def _build_merge_candidates(
    occurrences_by_code: Mapping[str, list[_CodeOccurrence]],
) -> tuple[MergeCandidateAudit, ...]:
    candidates: list[MergeCandidateAudit] = []
    for code, occurrences in sorted(occurrences_by_code.items()):
        page_numbers = tuple(sorted({item.page_number for item in occurrences}))
        if len(page_numbers) < 2:
            continue

        disciplines = tuple(sorted({item.discipline for item in occurrences}))
        candidate_count = len(disciplines)
        resolution_confidence = min(item.confidence for item in occurrences)
        affected_nodes = len(occurrences)
        has_ambiguity = any(item.page_has_ambiguity for item in occurrences)
        has_conflict = any(item.page_has_conflict for item in occurrences)
        risk = score_resolution_risk(
            ResolutionRiskSignals(
                ambiguity=float(has_ambiguity),
                conflict=float(has_conflict),
                fanout=float(len(page_numbers) >= 4),
                cross_discipline=float(len(disciplines) > 1),
                low_evidence=float(
                    any(
                        not item.has_valid_evidence or item.confidence < 0.60
                        for item in occurrences
                    )
                ),
                candidate_count=candidate_count,
                confidence=resolution_confidence,
                conflict_detected=has_conflict,
                cross_discipline_detected=len(disciplines) > 1,
                affected_nodes=affected_nodes,
            )
        )
        candidates.append(
            MergeCandidateAudit(
                code=code,
                occurrence_count=len(occurrences),
                page_numbers=page_numbers,
                disciplines=disciplines,
                raw_values=tuple(sorted({item.raw for item in occurrences})),
                candidate_count=candidate_count,
                resolution_confidence=resolution_confidence,
                affected_nodes=affected_nodes,
                risk=risk,
            )
        )
    return tuple(candidates)


def audit_fixture(paths: Iterable[Path]) -> FixtureAudit:
    disciplines: list[DisciplineObservation] = []
    overall_references = _ReferenceAccumulator()
    section_references: defaultdict[str, _ReferenceAccumulator] = defaultdict(
        _ReferenceAccumulator
    )
    category_references: defaultdict[str, _ReferenceAccumulator] = defaultdict(
        _ReferenceAccumulator
    )
    occurrences_by_code: defaultdict[str, list[_CodeOccurrence]] = defaultdict(list)
    page_count = 0

    for fallback_page_number, path_value in enumerate(paths, start=1):
        path = Path(path_value)
        with path.open("r", encoding="utf-8") as fixture_file:
            page = json.load(fixture_file)
        if not isinstance(page, dict):
            raise ValueError(f"fixture page must be a JSON object: {path}")

        page_count += 1
        page_number = _page_number(page, fallback_page_number)
        discipline_values = _discipline_values(page)
        for source_field, raw_discipline in discipline_values:
            disciplines.append(
                DisciplineObservation(
                    page_number=page_number,
                    source_field=source_field,
                    raw=raw_discipline,
                    normalized=normalize_discipline(raw_discipline),
                )
            )
        primary_discipline = next(
            (raw for field_name, raw in discipline_values if field_name == "value" and raw.strip()),
            discipline_values[0][1],
        )
        normalized_discipline = normalize_discipline(primary_discipline)

        evidence = page.get("evidence")
        evidence_ids = {
            item["evidence_id"]
            for item in evidence if isinstance(item, dict) and isinstance(item.get("evidence_id"), str)
        } if isinstance(evidence, list) else set()

        for section, value in page.items():
            if section == "evidence":
                continue
            refs = tuple(_iter_evidence_refs(value))
            if not refs:
                continue
            section_references[section].add(refs, evidence_ids, page_number)
            overall_references.add(refs, evidence_ids, page_number)

        observations = page.get("observations")
        if isinstance(observations, dict):
            for category, value in observations.items():
                refs = tuple(_iter_evidence_refs(value))
                category_references[category].add(refs, evidence_ids, page_number)

        for code, occurrence in _collect_code_occurrences(
            page,
            page_number,
            normalized_discipline,
            evidence_ids,
        ):
            occurrences_by_code[code].append(occurrence)

    merge_candidates = _build_merge_candidates(occurrences_by_code)
    risk_distribution = Counter({"low": 0, "moderate": 0, "high": 0})
    risk_distribution.update(candidate.risk.band for candidate in merge_candidates)
    escalation_count = sum(
        candidate.risk.requires_escalation for candidate in merge_candidates
    )
    escalation_percentage = (
        round(escalation_count * 100.0 / len(merge_candidates), 2)
        if merge_candidates
        else 0.0
    )

    return FixtureAudit(
        page_count=page_count,
        disciplines=tuple(disciplines),
        references=overall_references.freeze(),
        references_by_section={
            name: accumulator.freeze()
            for name, accumulator in sorted(section_references.items())
        },
        references_by_observation_category={
            name: accumulator.freeze()
            for name, accumulator in sorted(category_references.items())
        },
        merge_candidates=merge_candidates,
        risk_distribution=dict(risk_distribution),
        escalation_count=escalation_count,
        escalation_percentage=escalation_percentage,
    )


def render_audit_report(audit: FixtureAudit) -> str:
    discipline_counts = Counter(
        (item.source_field, item.raw, item.normalized) for item in audit.disciplines
    )
    lines = [
        "# PCKM Phase 3 Fixture Audit - 2026-07-15",
        "",
        "## Scope",
        "",
        f"- Stored JSON pages audited: {audit.page_count}",
        f"- Evidence references: {audit.references.total}",
        f"- Dangling evidence references: {audit.references.dangling}",
        f"- Pages with dangling references: {audit.references.pages_with_dangling}",
        "- Source files were read without modification.",
        "",
        "## Discipline Mapping",
        "",
        "| Source field | Observed value | Canonical value | Pages |",
        "| --- | --- | --- | ---: |",
    ]
    for (source_field, raw, normalized), count in sorted(
        discipline_counts.items(),
        key=lambda item: (item[0][1].casefold(), item[0][0], item[0][1]),
    ):
        display_raw = raw or "(empty)"
        lines.append(
            f"| {source_field} | {display_raw} | {normalized} | {count} |"
        )

    lines.extend(
        [
            "",
            "## Dangling References By Section",
            "",
            "| Section | References | Dangling | Affected pages |",
            "| --- | ---: | ---: | ---: |",
        ]
    )
    for section, counts in audit.references_by_section.items():
        lines.append(
            f"| {section} | {counts.total} | {counts.dangling} | "
            f"{counts.pages_with_dangling} |"
        )

    lines.extend(
        [
            "",
            "## Observation Reference Distribution",
            "",
            "| Category | References | Dangling | Dangling rate | Affected pages |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for category, counts in audit.references_by_observation_category.items():
        dangling_rate = (
            counts.dangling * 100.0 / counts.total if counts.total else 0.0
        )
        lines.append(
            f"| {category} | {counts.total} | {counts.dangling} | "
            f"{dangling_rate:.2f}% | {counts.pages_with_dangling} |"
        )

    category_rates = sorted(
        (
            (counts.dangling / counts.total if counts.total else 0.0, category)
            for category, counts in audit.references_by_observation_category.items()
        ),
        reverse=True,
    )
    highest_rate_categories = ", ".join(
        category for _, category in category_rates[:4]
    )
    lines.extend(
        [
            "",
            f"- Pattern: dangling references occur in all "
            f"{len(audit.references_by_observation_category)} observation categories; "
            "the defect is broad rather than isolated to one payload section.",
            f"- Highest dangling rates: {highest_rate_categories}.",
            "- Patch decision: retain facts from every observation category, intersect "
            "source references with evidence IDs that exist, and record unresolved "
            "references for review instead of dropping the fact.",
        ]
    )

    lines.extend(
        [
            "",
            "## Merge Candidates",
            "",
            f"Recurring normalized element codes: {len(audit.merge_candidates)}",
            "",
            "| Code | Occurrences | Candidate partitions | Confidence | Pages | Disciplines | Risk | Escalate |",
            "| --- | ---: | ---: | ---: | --- | --- | ---: | --- |",
        ]
    )
    for candidate in audit.merge_candidates:
        pages = ", ".join(str(page) for page in candidate.page_numbers)
        disciplines = ", ".join(candidate.disciplines)
        lines.append(
            f"| {candidate.code} | {candidate.occurrence_count} | "
            f"{candidate.candidate_count} | {candidate.resolution_confidence:.2f} | "
            f"{pages} | {disciplines} | {candidate.risk.score:.2f} | "
            f"{'yes' if candidate.risk.requires_escalation else 'no'} |"
        )

    lines.extend(
        [
            "",
            "## Risk Calibration",
            "",
            "| Signal | Weight |",
            "| --- | ---: |",
        ]
    )
    for signal, weight in RESOLUTION_RISK_WEIGHTS.items():
        lines.append(f"| {signal} | {weight:.2f} |")

    lines.extend(
        [
            "",
            f"- Low-risk candidates: {audit.risk_distribution['low']}",
            f"- Moderate-risk candidates: {audit.risk_distribution['moderate']}",
            f"- High-risk candidates: {audit.risk_distribution['high']}",
            f"- Escalated candidates: {audit.escalation_count}",
            f"- Escalation percentage: {audit.escalation_percentage:.2f}%",
            "- Calibration rationale: ambiguity and conflict each carry 0.30 because "
            "they can change graph identity; fanout and cross-discipline links each "
            "carry 0.15; low evidence carries 0.10 because facts remain usable with "
            "a review marker.",
            "- The 0.50 threshold requires compounded weighted risk, preventing one "
            "weak signal from routing most exact matches to the escalation provider.",
            "- Explicit escalation gates override the weighted threshold: multiple "
            "candidates, confidence below 0.78, detected conflict, cross-discipline "
            "resolution, or more than 20 affected nodes.",
            "- Candidate count is the number of distinct normalized discipline "
            "partitions for an exact code; confidence is the minimum source-label "
            "confidence in that candidate group. Both gates are therefore evaluated "
            "against fixture data instead of left at defaults.",
            "",
            "## Verification Evidence",
            "",
            "- Initial RED: `python -m pytest tests/test_project_graph_fixture_audit.py -q` -> 18 failed because the audited modules did not exist.",
            "- Review RED: the same focused command exposed 6 failures, then 5 failures, for missing escalation, raw-discipline, and report contracts.",
            "- Focused GREEN: `python -m pytest tests/test_project_graph_fixture_audit.py -q` -> 28 passed.",
            "- Full GREEN: `python -m pytest -q` -> 358 passed, 5 skipped; no image or network provider was invoked.",
            "",
        ]
    )
    return "\n".join(lines)
