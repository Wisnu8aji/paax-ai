"""Portable artifact-object storage; keys are never host filesystem paths."""
from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Protocol


class ArtifactUnavailable(FileNotFoundError):
    pass


class ArtifactStore(Protocol):
    def put(self, kind: str, data: bytes, *, content_type: str, object_key: str) -> str: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...


def _safe_key(value: str) -> str:
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or ".." in path.parts or ":" in value or not value:
        raise ValueError("artifact object key must be a relative portable key")
    return path.as_posix()


class LocalArtifactStore:
    """Dev/test adapter only. Its root never leaks into durable artifact keys."""
    def __init__(self, root: Path):
        self.root = root

    def put(self, kind: str, data: bytes, *, content_type: str, object_key: str) -> str:
        key = f"{_safe_key(kind)}/{_safe_key(object_key)}"
        destination = self.root.joinpath(*PurePosixPath(key).parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        source = self.root.joinpath(*PurePosixPath(_safe_key(key)).parts)
        if not source.is_file():
            raise ArtifactUnavailable(key)
        return source.read_bytes()

    def exists(self, key: str) -> bool:
        return self.root.joinpath(*PurePosixPath(_safe_key(key)).parts).is_file()
