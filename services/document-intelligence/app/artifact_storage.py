"""Portable artifact-object storage; keys are never host filesystem paths."""
from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Protocol
import base64
import hashlib
import hmac
import os
import time

import boto3
from botocore.exceptions import ClientError


class ArtifactUnavailable(FileNotFoundError):
    pass


class ArtifactStore(Protocol):
    def put(self, kind: str, data: bytes, *, content_type: str, object_key: str) -> str: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...


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

    def delete(self, key: str) -> None:
        source = self.root.joinpath(*PurePosixPath(_safe_key(key)).parts)
        if not source.is_file():
            raise ArtifactUnavailable(key)
        source.unlink()


class S3ArtifactStore:
    """Real object-storage adapter (S3-compatible: AWS S3, MinIO, GCS S3-compat
    mode). Keys are the same portable, host-independent object keys used by
    LocalArtifactStore -- there is no filesystem path leakage here either,
    just a different durable backing store. This closes the P1-6 gap: unlike
    LocalArtifactStore, artifacts written here survive process restart and
    are shared across multiple instances/Cloud Run's ephemeral filesystem.
    """

    def __init__(
        self,
        *,
        bucket: str | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
        client=None,
    ) -> None:
        self.bucket = bucket or os.environ["ARTIFACT_STORE_S3_BUCKET"]
        self._client = client or boto3.client(
            "s3",
            endpoint_url=endpoint_url or os.environ.get("ARTIFACT_STORE_S3_ENDPOINT_URL"),
            region_name=region_name or os.environ.get("ARTIFACT_STORE_S3_REGION", "us-east-1"),
        )

    def put(self, kind: str, data: bytes, *, content_type: str, object_key: str) -> str:
        key = f"{_safe_key(kind)}/{_safe_key(object_key)}"
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def get(self, key: str) -> bytes:
        safe = _safe_key(key)
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=safe)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise ArtifactUnavailable(key) from exc
            raise
        return response["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=_safe_key(key))
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return False
            raise

    def delete(self, key: str) -> None:
        if not self.exists(key):
            raise ArtifactUnavailable(key)
        self._client.delete_object(Bucket=self.bucket, Key=_safe_key(key))


def sign_artifact_key(key: str, *, secret: bytes, expires_at: int, project_id: str = "") -> str:
    """Sign the complete object-scope tuple, never a filesystem location."""
    safe = _safe_key(key)
    payload = f"v2:{project_id}:{safe}:{expires_at}".encode()
    signature = hmac.new(secret, payload, hashlib.sha256).digest()
    return f"{expires_at}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def verify_artifact_signature(key: str, token: str, *, secret: bytes, project_id: str = "", now: int | None = None) -> bool:
    try:
        expiry_text, supplied = token.split(".", 1)
        expiry = int(expiry_text)
    except (TypeError, ValueError):
        return False
    if expiry < (int(time.time()) if now is None else now):
        return False
    expected = sign_artifact_key(key, secret=secret, expires_at=expiry, project_id=project_id).split(".", 1)[1]
    return hmac.compare_digest(supplied, expected)
