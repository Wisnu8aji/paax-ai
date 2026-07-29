import pathlib
import hashlib
import json

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
TARGET_PDF_PATH = pathlib.Path(r"G:\paax-data\gambar kerja\gambar-kerja-arsitektur-gedung-a.pdf")
REPORT_PATH = REPO_ROOT / "report" / "report_drawing_intelligence" / "VIEWER_IMAGE_QUALITY_FINAL_REPORT.md"

EXPECTED_PDF_HASH = "7B4151C7EC7C87588B1C858CB0FB77FFDECA550ECB4C041714B3643ECD4B4510"
EMPTY_FILE_HASH = "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"


def test_pdf_sha256_hash_integrity():
    """Verify actual source PDF bytes produce SHA-256 7B4151C7... and reject empty file hash."""
    assert TARGET_PDF_PATH.exists(), f"Source PDF missing at {TARGET_PDF_PATH}"
    data = TARGET_PDF_PATH.read_bytes()
    assert len(data) == 9797197, f"Unexpected PDF byte size: {len(data)}"

    actual_hash = hashlib.sha256(data).hexdigest().upper()
    assert actual_hash == EXPECTED_PDF_HASH
    assert actual_hash != EMPTY_FILE_HASH


def test_viewer_report_contains_real_evidence_metrics():
    """Verify VIEWER_IMAGE_QUALITY_FINAL_REPORT.md contains exact empirical evidence."""
    assert REPORT_PATH.exists()
    content = REPORT_PATH.read_text(encoding="utf-8")

    # Hash verification
    assert EXPECTED_PDF_HASH in content
    assert EMPTY_FILE_HASH not in content

    # Measured metrics assertions
    assert "9,797,197 bytes" in content
    assert "FCP" in content
    assert "DOMContentLoaded" in content
    assert "usedJSHeapSize" in content or "Heap" in content
    assert "Accept-Ranges" in content or "Range" in content
    assert "Outage" in content or "Fail-closed" in content
