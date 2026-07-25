from __future__ import annotations

import hashlib
import json
import threading
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


class RevisionEntity(BaseModel):
    entity_id: str
    semantic_key: str
    geometry_hash: str | None = None
    quantity: Decimal | None = None
    unit: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class RevisionChange(BaseModel):
    change_id: str
    semantic_key: str
    status: Literal["added", "removed", "modified", "unchanged"]
    before: RevisionEntity | None = None
    after: RevisionEntity | None = None
    quantity_delta: Decimal | None = None
    stale_descendant_ids: list[str] = Field(default_factory=list)


class EntityLink(BaseModel):
    link_id: str
    project_id: str
    source_entity_type: str
    source_entity_id: str
    target_entity_type: Literal["boq", "rab", "rfi", "issue", "ncr", "task", "drawing"]
    target_entity_id: str
    source_revision_id: str


class EntityLinkRepository:
    """Atomic, idempotent portable persistence for cross-module backlinks."""

    _lock = threading.RLock()

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _key(link: EntityLink) -> str:
        return f"{link.project_id}|{link.source_entity_type}|{link.source_entity_id}|{link.target_entity_type}|{link.target_entity_id}|{link.source_revision_id}"

    def link(self, link: EntityLink) -> EntityLink:
        with self._lock:
            data = self._load()
            key = self._key(link)
            if key not in data:
                data[key] = link.model_dump(mode="json")
                self._save(data)
            return EntityLink.model_validate(data[key])

    def backlinks(self, project_id: str, source_entity_id: str | None = None) -> list[EntityLink]:
        with self._lock:
            links = [EntityLink.model_validate(value) for value in self._load().values()]
        return [link for link in links if link.project_id == project_id and (source_entity_id is None or link.source_entity_id == source_entity_id)]

    def _load(self) -> dict[str, dict]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _save(self, data: dict[str, dict]) -> None:
        temp = self.path.with_suffix(self.path.suffix + ".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self.path)


class EntityLinkService:
    def __init__(self) -> None:
        self._links: dict[str, EntityLink] = {}

    def link(self, link: EntityLink) -> EntityLink:
        key = f"{link.project_id}|{link.source_entity_type}|{link.source_entity_id}|{link.target_entity_type}|{link.target_entity_id}|{link.source_revision_id}"
        existing = self._links.get(key)
        if existing:
            return existing
        self._links[key] = link
        return link

    def backlinks(self, project_id: str, source_entity_id: str) -> list[EntityLink]:
        return [v for v in self._links.values() if v.project_id == project_id and v.source_entity_id == source_entity_id]


def compare_revisions(before: list[RevisionEntity], after: list[RevisionEntity], descendants: dict[str, list[str]] | None = None) -> list[RevisionChange]:
    descendants = descendants or {}
    left = {e.semantic_key: e for e in before}
    right = {e.semantic_key: e for e in after}
    changes: list[RevisionChange] = []
    for key in sorted(set(left) | set(right)):
        b, a = left.get(key), right.get(key)
        if b is None:
            status = "added"
        elif a is None:
            status = "removed"
        elif b.model_dump(mode="json", exclude={"entity_id"}) == a.model_dump(mode="json", exclude={"entity_id"}):
            status = "unchanged"
        else:
            status = "modified"
        delta = None
        if b and a and b.quantity is not None and a.quantity is not None and b.unit == a.unit:
            delta = a.quantity - b.quantity
        digest = hashlib.sha1(f"{key}|{status}".encode()).hexdigest()[:14]
        changes.append(RevisionChange(
            change_id=f"rev-change-{digest}", semantic_key=key, status=status,
            before=b, after=a, quantity_delta=delta,
            stale_descendant_ids=[] if status == "unchanged" else descendants.get(key, []),
        ))
    return changes
