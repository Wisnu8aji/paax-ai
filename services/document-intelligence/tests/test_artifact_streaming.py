from __future__ import annotations

from app.artifact_storage import LocalArtifactStore, S3ArtifactStore


def test_local_artifact_store_stat_and_range_iterator_do_not_read_full_file(tmp_path):
    payload = b"0123456789"
    store = LocalArtifactStore(tmp_path)
    key = store.put("original-pdf", payload, content_type="application/pdf", object_key="runs/R1/source.pdf")

    metadata = store.stat(key)
    assert metadata.size == len(payload)
    assert metadata.etag.startswith('"local-')
    assert b"".join(store.iter_range(key, 3, 6, chunk_size=2)) == b"3456"


class _StreamingBody:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.closed = False

    def iter_chunks(self, chunk_size: int):
        for offset in range(0, len(self.payload), chunk_size):
            yield self.payload[offset:offset + chunk_size]

    def read(self) -> bytes:
        raise AssertionError("streaming range reader must not call read()")

    def close(self) -> None:
        self.closed = True


class _FakeS3Client:
    def __init__(self, payload: bytes, *, etag: str | None = '"remote-etag"') -> None:
        self.payload = payload
        self.etag = etag
        self.head_calls = []
        self.range_calls = []
        self.body: _StreamingBody | None = None

    def head_object(self, *, Bucket, Key):
        self.head_calls.append((Bucket, Key))
        return {"ContentLength": len(self.payload), "ETag": self.etag, "ContentType": "application/pdf", "LastModified": "2026-07-26T00:00:00Z"}

    def get_object(self, *, Bucket, Key, Range):
        self.range_calls.append((Bucket, Key, Range))
        start, end = (int(value) for value in Range.removeprefix("bytes=").split("-", 1))
        self.body = _StreamingBody(self.payload[start:end + 1])
        return {"Body": self.body}


def test_s3_artifact_store_uses_head_then_ranged_stream_without_full_body_read():
    client = _FakeS3Client(b"abcdefghij")
    store = S3ArtifactStore(bucket="test-bucket", client=client)

    metadata = store.stat("original-pdf/runs/R1/source.pdf")
    chunks = list(store.iter_range("original-pdf/runs/R1/source.pdf", 2, 5, chunk_size=2))

    assert metadata.size == 10
    assert metadata.etag == '"remote-etag"'
    assert b"".join(chunks) == b"cdef"
    assert client.range_calls == [("test-bucket", "original-pdf/runs/R1/source.pdf", "bytes=2-5")]
    assert client.body is not None and client.body.closed is True


def test_s3_artifact_store_derives_an_opaque_etag_when_provider_omits_one():
    store = S3ArtifactStore(bucket="test-bucket", client=_FakeS3Client(b"abcdefghij", etag=None))

    metadata = store.stat("original-pdf/runs/R1/source.pdf")

    assert metadata.etag.startswith('"s3-')
    assert "source.pdf" not in metadata.etag
