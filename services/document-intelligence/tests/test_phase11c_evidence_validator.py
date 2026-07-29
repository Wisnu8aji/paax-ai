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


def test_raw_network_evidence_artifact_and_screenshots_exist():
    """Verify all 5 required screenshots and raw network evidence JSON artifact exist."""
    results_dir = REPO_ROOT / "apps" / "web" / "e2e" / "results"
    evidence_json = results_dir / "phase11c-raw-network-evidence.json"

    assert evidence_json.exists(), f"Missing raw network evidence artifact: {evidence_json}"

    screenshots = [
        "phase11c-desktop-100.png",
        "phase11c-desktop-200.png",
        "phase11c-mobile.png",
        "phase11c-outage-error.png",
        "phase11c-recovery-success.png",
    ]
    for ss in screenshots:
        ss_path = results_dir / ss
        assert ss_path.exists(), f"Missing required evidence screenshot: {ss_path}"


def test_exact_206_range_contract_evidence():
    """Verify raw network evidence JSON records exact HTTP 206 status and range parameters."""
    evidence_json = REPO_ROOT / "apps" / "web" / "e2e" / "results" / "phase11c-raw-network-evidence.json"
    assert evidence_json.exists()

    data = json.loads(evidence_json.read_text(encoding="utf-8"))

    # Source PDF assertions
    assert data["pdf_source"]["byte_size"] == 9797197
    assert data["pdf_source"]["sha256_hash"] == EXPECTED_PDF_HASH
    assert data["pdf_source"]["empty_file_hash_rejected"] is True

    # Direct 8002 Range assertion
    direct = data["direct_backend_8002"]
    assert direct["http_status"] == 206
    assert direct["accept_ranges"] == "bytes"
    assert direct["content_range"] == "bytes 0-65535/9797197"
    assert direct["content_length"] == 65536
    assert direct["received_body_bytes"] == 65536

    # Proxied 3000 Range assertion
    proxied = data["proxied_web_3000"]
    assert proxied["http_status"] == 206
    assert proxied["accept_ranges"] == "bytes"
    assert proxied["content_range"] == "bytes 0-65535/9797197"
    assert proxied["content_length"] == 65536
    assert proxied["received_body_bytes"] == 65536
