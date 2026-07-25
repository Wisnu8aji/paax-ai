from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Literal

from pydantic import BaseModel, Field

from .models import VectorDescriptor
from .prototype_learning import score_against_examples


class PrototypeSample(BaseModel):
    sample_id: str
    page_index: int = Field(ge=0)
    bbox: dict[str, Any]
    descriptor: VectorDescriptor
    label: Literal["positive", "negative"]
    evidence_refs: list[str] = Field(default_factory=list)


class ProjectPrototypeVersion(BaseModel):
    prototype_id: str
    project_id: str
    package_id: str
    name: str
    category: str
    version: int = Field(ge=1)
    created_at: str
    created_by: str
    source_document_sha256: str
    samples: list[PrototypeSample]
    threshold: float = Field(default=0.78, ge=0, le=1)
    calibration: dict[str, Any] = Field(default_factory=dict)
    supersedes_version: int | None = None
    status: Literal["active", "superseded", "rolled_back"] = "active"


class PrototypeRegistry(BaseModel):
    schema_version: str = "paax.drawing-intelligence.prototype-registry.v1"
    project_id: str
    package_id: str
    versions: list[ProjectPrototypeVersion] = Field(default_factory=list)


def empty_registry(project_id: str, package_id: str) -> PrototypeRegistry:
    return PrototypeRegistry(project_id=project_id, package_id=package_id)


def _prototype_id(project_id: str, name: str, category: str) -> str:
    digest = hashlib.sha256(f"{project_id}|{category}|{name}".encode("utf-8")).hexdigest()[:16]
    return f"prototype-{digest}"


def add_prototype_version(
    registry: PrototypeRegistry,
    *,
    name: str,
    category: str,
    source_document_sha256: str,
    samples: list[PrototypeSample],
    actor_id: str,
    threshold: float = 0.78,
) -> PrototypeRegistry:
    if not samples or not any(sample.label == "positive" for sample in samples):
        raise ValueError("prototype requires at least one positive sample")
    prototype_id = _prototype_id(registry.project_id, name, category)
    prior = [version for version in registry.versions if version.prototype_id == prototype_id]
    next_version = max((version.version for version in prior), default=0) + 1
    latest = max(prior, key=lambda item: item.version) if prior else None

    # Calibration is reproducible and descriptive. It does not retrain or
    # mutate a model online; a new immutable version is appended instead.
    positives = [sample.descriptor for sample in samples if sample.label == "positive"]
    negatives = [sample.descriptor for sample in samples if sample.label == "negative"]
    positive_self_scores = []
    for descriptor in positives:
        result = score_against_examples(
            descriptor, positive_examples=positives,
            negative_examples=negatives, threshold=threshold,
        )
        positive_self_scores.append(result.score)
    calibration = {
        "positive_sample_count": len(positives),
        "negative_sample_count": len(negatives),
        "mean_positive_self_score": round(mean(positive_self_scores), 6) if positive_self_scores else 0.0,
        "mutation_policy": "offline_versioned_only",
    }
    version = ProjectPrototypeVersion(
        prototype_id=prototype_id,
        project_id=registry.project_id,
        package_id=registry.package_id,
        name=name,
        category=category,
        version=next_version,
        created_at=datetime.now(timezone.utc).isoformat(),
        created_by=actor_id,
        source_document_sha256=source_document_sha256,
        samples=samples,
        threshold=threshold,
        calibration=calibration,
        supersedes_version=latest.version if latest else None,
    )
    versions = []
    for item in registry.versions:
        if item.prototype_id == prototype_id and item.status == "active":
            versions.append(item.model_copy(update={"status": "superseded"}))
        else:
            versions.append(item)
    versions.append(version)
    return registry.model_copy(update={"versions": versions}, deep=True)


def latest_active(registry: PrototypeRegistry, prototype_id: str) -> ProjectPrototypeVersion | None:
    versions = [
        version for version in registry.versions
        if version.prototype_id == prototype_id and version.status == "active"
    ]
    return max(versions, key=lambda item: item.version) if versions else None


def rollback_prototype(
    registry: PrototypeRegistry,
    *,
    prototype_id: str,
    target_version: int,
    actor_id: str,
) -> PrototypeRegistry:
    target = next(
        (item for item in registry.versions if item.prototype_id == prototype_id and item.version == target_version),
        None,
    )
    if target is None:
        raise KeyError(f"prototype version not found: {prototype_id} v{target_version}")
    current = latest_active(registry, prototype_id)
    versions = [
        item.model_copy(update={"status": "rolled_back"})
        if item.prototype_id == prototype_id and item.status == "active"
        else item
        for item in registry.versions
    ]
    new_version = max(item.version for item in registry.versions if item.prototype_id == prototype_id) + 1
    restored = target.model_copy(update={
        "version": new_version,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": actor_id,
        "supersedes_version": current.version if current else None,
        "status": "active",
        "calibration": {
            **target.calibration,
            "rollback_from_version": current.version if current else None,
            "rollback_target_version": target_version,
        },
    }, deep=True)
    return registry.model_copy(update={"versions": [*versions, restored]}, deep=True)


def registry_digest(registry: PrototypeRegistry) -> str:
    payload = json.dumps(registry.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
