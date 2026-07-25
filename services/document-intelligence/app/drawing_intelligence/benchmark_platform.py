from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any

from pydantic import BaseModel, Field


class BenchmarkFact(BaseModel):
    fact_id: str
    category: str
    expected: Any
    source_pages: list[int]
    hidden: bool = False


class BenchmarkPack(BaseModel):
    pack_id: str
    project_name: str
    source_hash: str
    facts: list[BenchmarkFact]
    reviewers: list[str]
    immutable: bool = True


class LayerMetric(BaseModel):
    layer: str
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1: float = Field(ge=0, le=1)
    coverage: float = Field(ge=0, le=1)
    errors: list[str] = Field(default_factory=list)


class BenchmarkScorecard(BaseModel):
    pack_id: str
    exact_facts: int
    total_facts: int
    exactness: float
    metrics: list[LayerMetric]
    failures: list[str]


def create_locked_plhut_pack(source_hash: str) -> BenchmarkPack:
    facts = [
        BenchmarkFact(fact_id="plhut-l1-k1", category="physical_count", expected=4, source_pages=[42]),
        BenchmarkFact(fact_id="plhut-l1-k1a", category="physical_count", expected=8, source_pages=[42]),
        BenchmarkFact(fact_id="plhut-l1-k2", category="physical_count", expected=4, source_pages=[42]),
        BenchmarkFact(fact_id="plhut-l1-k3", category="physical_count", expected=5, source_pages=[42]),
        BenchmarkFact(fact_id="plhut-l2-k1a", category="physical_count", expected=8, source_pages=[43]),
        BenchmarkFact(fact_id="plhut-l2-k2", category="physical_count", expected=4, source_pages=[43]),
        BenchmarkFact(fact_id="plhut-l2-k3", category="physical_count", expected=5, source_pages=[43]),
        BenchmarkFact(fact_id="plhut-l2-kp", category="physical_count", expected=18, source_pages=[43]),
        BenchmarkFact(fact_id="plhut-k2-dim", category="dimension_mm", expected=[250, 600], source_pages=[50]),
        BenchmarkFact(fact_id="plhut-k2-l2-volume", category="volume_m3", expected=2.34, source_pages=[43, 50, 54], hidden=True),
        BenchmarkFact(fact_id="plhut-page54-scales", category="scale_set", expected=[10, 25, 100], source_pages=[54]),
    ]
    return BenchmarkPack(pack_id="plhut-locked-v1", project_name="PLHUT Surakarta", source_hash=source_hash,
                         facts=facts, reviewers=["independent-audit", "engineering-review"])


def evaluate_facts(pack: BenchmarkPack, predictions: dict[str, Any]) -> BenchmarkScorecard:
    failures: list[str] = []
    exact = 0
    by_category: dict[str, list[bool]] = {}
    for fact in pack.facts:
        observed = predictions.get(fact.fact_id, object())
        ok = observed == fact.expected
        by_category.setdefault(fact.category, []).append(ok)
        if ok:
            exact += 1
        else:
            failures.append(f"{fact.fact_id}: expected={fact.expected!r}, observed={observed!r}")
    metrics = []
    for category, values in sorted(by_category.items()):
        score = sum(values) / len(values)
        metrics.append(LayerMetric(layer=category, precision=score, recall=score, f1=score, coverage=1.0,
                                   errors=[] if score == 1 else ["exact-match failure"] ))
    total = len(pack.facts)
    return BenchmarkScorecard(pack_id=pack.pack_id, exact_facts=exact, total_facts=total,
                              exactness=exact / total if total else 0.0, metrics=metrics, failures=failures)


def write_pack(pack: BenchmarkPack, path: Path) -> None:
    payload = pack.model_dump(mode="json")
    payload["manifest_sha256"] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")
