"""Real object-storage adapter (S3ArtifactStore) closing the P1-6 durability
gap: LocalArtifactStore's data does not survive process restart and is not
shared across instances/Cloud Run's ephemeral filesystem. Uses a fake boto3
client (dependency-injected via the `client=` constructor param, matching
DemDbClient's transport-injection convention) rather than hitting a real S3
endpoint in unit tests -- see test_s3_artifact_store_against_real_minio.py
for the live-server integration test."""
from __future__ import annotations

import io

import pytest
from botocore.exceptions import ClientError

from app.artifact_storage import ArtifactUnavailable, S3ArtifactStore


class _FakeS3Client:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def put_object(self, *, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "not found"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404", "Message": "not found"}}, "HeadObject")
        return {}

    def delete_object(self, *, Bucket, Key):
        self.objects.pop(Key, None)


def test_s3_artifact_store_put_get_exists_delete_round_trip():
    store = S3ArtifactStore(bucket="test-bucket", client=_FakeS3Client())

    key = store.put("original-pdf", b"%PDF-fixture", content_type="application/pdf", object_key="runs/R1/original.pdf")
    assert key == "original-pdf/runs/R1/original.pdf"
    assert store.exists(key)
    assert store.get(key) == b"%PDF-fixture"

    store.delete(key)
    assert not store.exists(key)
    with pytest.raises(ArtifactUnavailable):
        store.get(key)
    with pytest.raises(ArtifactUnavailable):
        store.delete(key)


def test_s3_artifact_store_rejects_absolute_or_traversal_keys():
    store = S3ArtifactStore(bucket="test-bucket", client=_FakeS3Client())
    with pytest.raises(ValueError, match="relative"):
        store.put("original-pdf", b"x", content_type="application/pdf", object_key="C:/absolute.pdf")
    with pytest.raises(ValueError, match="relative"):
        store.put("original-pdf", b"x", content_type="application/pdf", object_key="../escape.pdf")


def test_s3_artifact_store_get_missing_key_raises_artifact_unavailable():
    store = S3ArtifactStore(bucket="test-bucket", client=_FakeS3Client())
    with pytest.raises(ArtifactUnavailable):
        store.get("rendered-pages/runs/R1/missing.png")
