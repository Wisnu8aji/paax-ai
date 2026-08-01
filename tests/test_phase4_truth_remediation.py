"""
test_phase4_truth_remediation.py

Phase 4 provenance tests. These tests:
- Verify production source contains NO embedded verified_blueprints or hardcoded results.
- Verify authenticated web proxies return correct HTTP status after a clean startup.
- Verify package index classification is honest (needs_review count reported truthfully).
- Verify civil work items pipeline contains no hardcoded result values.
- Verify security scan passes (no live-test-key or test-internal-key in production).
- Verify database measurement_facts provenance integrity.
"""

import ast
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("PAAX_DATA_ROOT", "G:/PAAX-Data")) / "db" / "portable.sqlite"


# ─────────────────────────────────────────────
# 1. Source Code Provenance Tests
# ─────────────────────────────────────────────

class TestNoHardcodedProductionData:
    """Verify that civil_work_items_live.py has no embedded blueprint data."""

    def _load_source(self) -> str:
        source = REPO_ROOT / "services/db/src/paax_db/civil_work_items_live.py"
        return source.read_text(encoding="utf-8")

    def test_no_verified_blueprints_variable(self):
        """Phase 4: verified_blueprints list must not exist as a variable assignment in production source."""
        src = self._load_source()
        # Must not appear as a variable assignment (not just in comments/docstrings)
        import re
        # Pattern: 'verified_blueprints = [' or 'verified_blueprints=['
        pattern = re.compile(r'\bverified_blueprints\s*=')
        assert not pattern.search(src), (
            "civil_work_items_live.py still contains 'verified_blueprints = ...' assignment — "
            "hardcoded data must be removed (Phase 4 Finding A)"
        )

    def test_no_hardcoded_result_values(self):
        """Specific hardcoded result values from Phase 2 must not appear in source as literal data."""
        src = self._load_source()
        import re
        # Only check for these exact value literals as dict/JSON values, not as math operands
        # These were written as '"result": 2.816' etc in verified_blueprints
        forbidden_patterns = [
            r'"result"\s*:\s*2\.816',
            r'"result"\s*:\s*4\.752',
            r'"result"\s*:\s*6\.48',
            r'"result"\s*:\s*10\.8',
            r'"result"\s*:\s*34\.56',
            r'"result"\s*:\s*4\.8',
            r'"result"\s*:\s*3\.0',
            r'"result"\s*:\s*2\.2',
        ]
        for pat in forbidden_patterns:
            assert not re.search(pat, src), (
                f"civil_work_items_live.py contains hardcoded result literal matching '{pat}' — "
                "Phase 4 Finding A: AI cannot calculate quantities"
            )

    def test_no_fake_timestamps(self):
        """Hardcoded Phase 2 timestamp must not appear in production source."""
        src = self._load_source()
        assert "2026-08-01T12:00:00Z" not in src, (
            "civil_work_items_live.py contains hardcoded timestamp '2026-08-01T12:00:00Z' — "
            "Phase 4 Finding A"
        )

    def test_no_fake_input_hashes(self):
        """Known fake hash patterns from Phase 2 must not appear in production source."""
        src = self._load_source()
        fake_hashes = ["112233", "c8a1e2f3", "a9b8c7d6", "f1e2d3c4", "22334455", "33445566", "44556677", "55667788"]
        for h in fake_hashes:
            assert h not in src, (
                f"civil_work_items_live.py contains fake hash fragment '{h}' — "
                f"Phase 4 Finding A: all hashes must be computed from real inputs"
            )

    def test_no_engine_receipt_embedded(self):
        """engine_receipt dicts must not be constructed as literals in production source."""
        src = self._load_source()
        assert '"engine_receipt"' not in src or 'engine_receipt' not in src.split("def ")[0], (
            "civil_work_items_live.py may embed engine_receipt objects — "
            "verify this is computed, not literal"
        )
        # Stronger check: no literal dict with both engine_version and rule_id
        assert not ('"engine_version"' in src and '"REINFORCED_CONCRETE_COLUMN_V1"' in src), (
            "civil_work_items_live.py contains embedded engine_receipt blueprint literal — Phase 4 Finding A"
        )

    def test_no_hardcoded_source_pages_global_list(self):
        """Global source page fallback [6, 7, 8, 42, 44] must not appear in production."""
        src = self._load_source()
        assert "[6, 7, 8, 42, 44]" not in src and "[6,7,8,42,44]" not in src, (
            "civil_work_items_live.py uses global hardcoded source page list [6,7,8,42,44] — "
            "Phase 4 Finding A: pages must come from evidence graph"
        )

    def test_no_default_count_one(self):
        """count=1 as a default fallback for unknown candidates must not exist."""
        src = self._load_source()
        # Allow count=1 in explanatory comments but not as a data default assignment
        # Check there's no 'count": 1' literal (the old hardcoded pattern)
        assert '"count": 1,' not in src, (
            "civil_work_items_live.py contains 'count: 1' default — "
            "Phase 4 Finding A: count must come from evidence, not be defaulted"
        )


class TestSecurityScan:
    """Verify security quality gate passes."""

    def test_no_hardcoded_credentials_in_production(self):
        """Run the security scanner and verify it passes."""
        scanner = REPO_ROOT / "scripts/quality/check_no_hardcoded_service_key.py"
        result = subprocess.run(
            [sys.executable, str(scanner)],
            capture_output=True, text=True, cwd=str(REPO_ROOT)
        )
        assert result.returncode == 0, (
            f"Security scanner FAILED:\n{result.stdout}\n{result.stderr}\n"
            "Phase 4 Finding F: no hardcoded credentials allowed in production"
        )

    def test_no_dummy_fixture_in_production(self):
        """Run the no-dummy quality gate and verify it passes."""
        scanner = REPO_ROOT / "scripts/quality/check_no_production_di_dummy.py"
        result = subprocess.run(
            [sys.executable, str(scanner)],
            capture_output=True, text=True, cwd=str(REPO_ROOT)
        )
        assert result.returncode == 0, (
            f"No-dummy scanner FAILED:\n{result.stdout}\n{result.stderr}"
        )


# ─────────────────────────────────────────────
# 2. Database Provenance Tests
# ─────────────────────────────────────────────

class TestMeasurementFactProvenance:
    """Verify measurement_facts integrity in live database."""

    @pytest.fixture
    def db_conn(self):
        import sqlite3
        if not DB_PATH.is_file():
            pytest.skip(f"Database not found at {DB_PATH}")
        conn = sqlite3.connect(str(DB_PATH))
        yield conn
        conn.close()

    def test_measurement_facts_table_exists(self, db_conn):
        cur = db_conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='measurement_facts'")
        assert cur.fetchone() is not None, "measurement_facts table must exist"

    def test_verified_facts_have_required_fields(self, db_conn):
        """Each human_verified fact must have measurement_id, value, unit, evidence_refs."""
        cur = db_conn.cursor()
        cur.execute("""
            SELECT measurement_id, value, unit, evidence_refs, verification_status
            FROM measurement_facts
            WHERE verification_status IN ('human_verified', 'ai_verified')
            AND superseded_at IS NULL
        """)
        rows = cur.fetchall()
        for row in rows:
            meas_id, value, unit, ev_refs_json, vstatus = row
            assert meas_id, "measurement_id must not be null"
            assert value is not None, f"Fact {meas_id} has null value"
            assert unit, f"Fact {meas_id} has null unit"
            ev_refs = json.loads(ev_refs_json) if ev_refs_json else []
            assert isinstance(ev_refs, list), f"Fact {meas_id} evidence_refs must be a list"

    def test_civil_work_items_live_builds_from_db(self):
        """build_live_civil_work_items should return a valid schema without errors."""
        if not DB_PATH.is_file():
            pytest.skip(f"Database not found at {DB_PATH}")
        sys.path.insert(0, str(REPO_ROOT / "services/db/src"))
        from paax_db.civil_work_items_live import build_live_civil_work_items
        payload = build_live_civil_work_items(DB_PATH)
        assert "schema_version" in payload
        assert payload["schema_version"] == "3.0-live-phase4", \
            "Must use Phase 4 schema version, not old hardcoded schema"
        assert "data_provenance" in payload
        assert payload["data_provenance"]["no_hardcoded_blueprints"] is True
        assert "items" in payload
        assert payload["summary"]["engine_verified_count"] == 0, (
            "No persisted calculation receipt exists in the Phase 4 fixture; "
            "MeasurementFacts must remain measurement_verified rather than engine_verified"
        )
        assert payload["summary"]["measurement_verified_count"] >= 0
        assert payload["reconciliation"]["reconciled"] is True
        # Verified items must only come from measurement_facts
        for item in payload["items"]:
            if item.get("status") == "engine_verified":
                assert "measurement_fact_id" in item, \
                    f"engine_verified item {item['id']} must have measurement_fact_id from DB"
                assert "input_hash" in item, \
                    f"engine_verified item {item['id']} must have computed input_hash"


# ─────────────────────────────────────────────
# 3. Package Index Honesty Tests
# ─────────────────────────────────────────────

class TestPackageIndexHonesty:
    """Verify package index reports needs_review count honestly."""

    def test_package_index_from_db_builds(self):
        """build_package_index_from_db should not error on real database."""
        if not DB_PATH.is_file():
            pytest.skip(f"Database not found at {DB_PATH}")
        sys.path.insert(0, str(REPO_ROOT / "services/db/src"))
        from paax_db.package_index import build_package_index_from_db
        manifest = build_package_index_from_db(DB_PATH)
        assert manifest["total_pages"] == 88, "Must have exactly 88 pages"
        # Phase 4: honest reporting — unassigned_count should be reported as-is
        assert "needs_review_count" in manifest, "Must report needs_review_count"
        assert "unassigned_count" in manifest, "Must report unassigned_count"
        # Verify no page has UNASSIGNED level marked as confident
        for page in manifest["pages"]:
            if page["level"] == "UNASSIGNED":
                assert page.get("classification_status") != "confident", \
                    f"Page {page['page_number']} has UNASSIGNED level but marked as confident — dishonest"

    def test_classify_page_uncertain_returns_needs_review(self):
        """classify_page() must return needs_review for ambiguous titles."""
        sys.path.insert(0, str(REPO_ROOT / "services/db/src"))
        from paax_db.package_index import classify_page
        # Empty title is ambiguous
        result = classify_page("", "", "")
        assert result["classification_status"] == "needs_review" or result["classification"] == "needs_review", \
            "Empty title must return needs_review classification"
        # Random text without keywords
        result2 = classify_page("PLHUT-SURAKARTA-88PG-13", "", "")
        assert result2["classification_status"] == "needs_review" or result2["classification"] == "needs_review", \
            "Ambiguous title without known keywords must return needs_review"

    def test_classify_page_confident_known_types(self):
        """classify_page() must return confident for clearly identifiable pages."""
        sys.path.insert(0, str(REPO_ROOT / "services/db/src"))
        from paax_db.package_index import classify_page
        result = classify_page("TAMPAK DEPAN", "", "")
        assert result["classification"] == "elevation"
        assert result["classification_status"] == "confident"
        assert result["level"] == "NON_LEVEL"

        result2 = classify_page("DENAH LANTAI 1", "", "")
        assert result2["classification"] == "plan"
        assert result2["level"] == "Lantai 1"
        assert result2["classification_status"] == "confident"


# ─────────────────────────────────────────────
# 4. Runtime API Probe Tests (requires live stack)
# ─────────────────────────────────────────────

class TestRuntimeAPIProbes:
    """Verify key API endpoints return correct status after clean startup.

    Tests that hit port 3000 (web proxy) require INTERNAL_SERVICE_KEY to be set
    in the web process environment — this works after a fresh stack restart via
    Start-PLHUT-Local.ps1 (Phase 4 fixed). Current session (old web process) may
    return 503 if key not set in that process.

    Tests that hit port 8001 (DB service directly) use the key from keyfile.
    """

    WEB_BASE = "http://127.0.0.1:3000"
    DB_BASE = "http://127.0.0.1:8001"

    def _get_internal_key(self):
        """Read INTERNAL_SERVICE_KEY from key file or env."""
        key = os.environ.get("INTERNAL_SERVICE_KEY")
        if key:
            return key.strip()
        # Try the runtime keyfile used by the stack
        data_root = os.environ.get("PAAX_DATA_ROOT", "G:/PAAX-Data")
        keyfile = Path(data_root) / "runtime" / "internal-service.key"
        if keyfile.is_file():
            return keyfile.read_text().strip()
        return None

    def _get_web(self, path: str, timeout: int = 10) -> tuple:
        url = f"{self.WEB_BASE}{path}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except urllib.error.URLError as e:
            pytest.fail(f"Live acceptance requires web service on port 3000: {e}")

    def _post_web(self, path: str, payload: dict, timeout: int = 10) -> tuple:
        request = urllib.request.Request(
            f"{self.WEB_BASE}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()
        except urllib.error.URLError as error:
            pytest.fail(f"Live acceptance requires web service on port 3000: {error}")

    def _get_db(self, path: str, timeout: int = 10) -> tuple:
        key = self._get_internal_key()
        assert key, "Live acceptance requires an internal key from the protected runtime key file"
        if not key:
            pytest.skip("INTERNAL_SERVICE_KEY not available — skip direct DB probe")
        url = f"{self.DB_BASE}{path}"
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "X-Internal-Key": key,
                    "X-User-Id": os.environ.get("PAAX_PORTABLE_ACTOR_ID", "paax-web")
                }
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except urllib.error.URLError as e:
            pytest.fail(f"Live acceptance requires DB service on port 8001: {e}")

    def test_health_web_and_db(self):
        """Both web and DB health endpoints must return 200."""
        # Web health (no auth needed)
        status, body = self._get_web("/api/health")
        assert status == 200, f"Web health returned {status}"
        data = json.loads(body)
        assert data.get("status") == "ok"

        # DB health (no auth needed)
        try:
            req = urllib.request.Request(f"{self.DB_BASE}/health")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data2 = json.loads(resp.read())
                assert data2.get("status") == "ok"
        except Exception as e:
            pytest.fail(f"Live acceptance requires DB API on port 8001: {e}")

    def test_thumbnail_direct_db(self):
        """Thumbnail endpoint on DB service must return PNG bytes."""
        status, body = self._get_db(
            "/projects/PLHUT-SURAKARTA/pages/0/thumbnail?width=400"
        )
        if status == 401:
            pytest.fail("Valid authenticated DB thumbnail probe returned 401")
            pytest.skip(
                "DB service returned 401 — running DB process lacks INTERNAL_SERVICE_KEY "
                "in its environment (started before Phase 4 Start-PLHUT-Local.ps1 fix). "
                "Restart stack to verify live HTTP probe."
            )
        assert status == 200, f"Direct DB thumbnail returned {status} — body: {body[:200]}"
        assert body[:4] == b"\x89PNG", (
            f"Direct DB thumbnail did not return PNG — got {body[:20]!r}"
        )

    def test_civil_work_items_direct_db(self):
        """Civil work items endpoint on DB service must return Phase 4 schema."""
        status, body = self._get_db(
            "/projects/PLHUT-SURAKARTA/project-graph/civil-work-items"
        )
        if status == 401:
            pytest.fail("Valid authenticated DB civil-work-items probe returned 401")
            pytest.skip(
                "DB service returned 401 — running DB process lacks INTERNAL_SERVICE_KEY "
                "in its environment (started before Phase 4 Start-PLHUT-Local.ps1 fix). "
                "Restart stack to verify live HTTP probe."
            )
        assert status == 200, f"Direct DB civil-work-items returned {status} — body: {body[:200]}"
        payload = json.loads(body)
        assert payload.get("schema_version") == "3.0-live-phase4", (
            f"Must serve Phase 4 schema version, got: {payload.get('schema_version')}"
        )
        for item in payload.get("items", []):
            if item.get("status") == "engine_verified":
                assert "measurement_fact_id" in item, (
                    f"engine_verified item {item['id']} must link to measurement_fact_id from DB"
                )
                ih = item.get("input_hash", "")
                assert "112233" not in ih, f"Fake hash detected in live response: {ih}"

    def test_web_proxy_endpoints_after_restart(self):
        """Verify web proxy routes respond correctly (needs fresh stack via Phase 4 Start-PLHUT-Local.ps1).

        If the web process was started before this Phase 4 fix, it will lack INTERNAL_SERVICE_KEY
        and return 503 from the proxy. After restart, it should return 401 (DB auth) or 200 (auth pass).
        A 503 from proxy indicates the Phase 4 env propagation fix has not taken effect yet.
        """
        # Check web proxy civil-work-items: expect 200 or 401 (auth required by DB), never 503 from proxy
        status, body = self._get_web(
            "/api/db-projects/projects/PLHUT-SURAKARTA/project-graph/civil-work-items"
        )
        if status == 503:
            body_text = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else str(body)
            if "internal auth not configured" in body_text:
                pytest.fail(
                    "Web proxy returned 503 'internal auth not configured' — "
                    "INTERNAL_SERVICE_KEY not set in web process env. "
                    "Restart the stack using Phase 4 fixed Start-PLHUT-Local.ps1."
                )
        # 200 (direct pass via session token) or 401 (DB auth required) both acceptable
        assert status == 200, f"Web proxy civil-work-items must return 200, got {status}"

    def test_direct_db_rejects_missing_and_invalid_internal_key(self):
        """Bad internal credentials must fail closed and are not valid probes."""
        for key in (None, "invalid-phase4-key"):
            headers = {"X-User-Id": os.environ.get("PAAX_PORTABLE_ACTOR_ID", "paax-web")}
            if key is not None:
                headers["X-Internal-Key"] = key
            request = urllib.request.Request(
                f"{self.DB_BASE}/projects/PLHUT-SURAKARTA/project-graph/civil-work-items", headers=headers,
            )
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    status = response.status
            except urllib.error.HTTPError as error:
                status = error.code
            except urllib.error.URLError as error:
                pytest.fail(f"Live acceptance requires DB service on port 8001: {error}")
            assert status in (401, 503), f"Bad internal credential must fail closed, got {status}"

    def test_launcher_runtime_key_acl_and_nonleak(self):
        """The launcher keeps the runtime key file-only and user-private."""
        data_root = Path(os.environ.get("PAAX_DATA_ROOT", "G:/PAAX-Data"))
        key_file = data_root / "runtime" / "internal-service.key"
        assert key_file.is_file(), "Secure portable startup must create a runtime key file"
        assert not list((data_root / "runtime").glob("*.launch.bat")), "Secret-bearing launcher batch files are forbidden"
        key = key_file.read_text(encoding="utf-8").strip()
        assert len(key) >= 32
        powershell = (
            "$p='" + str(key_file).replace("'", "''") + "'; "
            "$a=Get-Acl -LiteralPath $p; $u=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; "
            "$r=@($a.Access); $mine=@($r | Where-Object { $_.IdentityReference.Value -eq $u -and -not $_.IsInherited -and $_.AccessControlType -eq 'Allow' -and (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) }); "
            "if($a.Owner -ne $u -or $r.Count -ne 1 -or $mine.Count -ne 1){exit 1}; "
            "$leak=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:PAAX_RUNTIME_KEY_CHECK) }; if($leak){exit 2}"
        )
        env = os.environ.copy()
        env["PAAX_RUNTIME_KEY_CHECK"] = key
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", powershell],
            cwd=str(REPO_ROOT), env=env, capture_output=True, text=True,
        )
        assert result.returncode == 0, "Runtime key ACL is not user-only or key leaked to a command line"

    def test_cr2a_authenticated_web_gateway_contracts(self):
        """CR2A reads use the web gateway, canonical index, and Core Engine."""
        project_id = "PLHUT-SURAKARTA"
        run_id = "514fb7f2-26fd-5816-9f22-a4a2412688bf"
        paths = {
            "/api/health": "health",
            "/api/db-projects/projects": "project list",
            f"/api/db-projects/projects/{project_id}": "project detail",
            f"/api/db-projects/projects/{project_id}/drawing-intelligence/package-analysis?run_id={run_id}": "canonical package index",
            f"/api/db-projects/projects/{project_id}/project-graph/civil-work-items": "civil ledger",
            f"/api/db-projects/projects/{project_id}/project-graph/review-queue": "review queue",
            f"/api/db-projects/projects/{project_id}/project-graph/corrections": "correction ledger",
            f"/api/db-projects/projects/{project_id}/project-graph/rab-bridge/proposals": "handoff proposals",
            f"/api/db-projects/projects/{project_id}/source-document/pdf": "source PDF",
            f"/api/db-projects/projects/{project_id}/source-document/pages/0/image?width=400": "source page image",
            f"/api/db-projects/projects/{project_id}/pages/0/thumbnail?width=400": "source thumbnail",
            f"/api/document-intelligence/drawings/dem/{run_id}/index": "DI canonical index adapter",
            f"/api/agent-runs?projectId={project_id}": "Mission runs",
        }
        payloads = {}
        for path, label in paths.items():
            status, body = self._get_web(path, timeout=30)
            assert status == 200, f"{label} must return 200 through web, got {status}"
            payloads[path] = body

        package_path = f"/api/db-projects/projects/{project_id}/drawing-intelligence/package-analysis?run_id={run_id}"
        package = json.loads(payloads[package_path])
        assert package["total_pages"] == 88
        assert [page["page_number"] for page in package["pages"]] == list(range(1, 89))
        di_index = json.loads(payloads[f"/api/document-intelligence/drawings/dem/{run_id}/index"])
        assert di_index["total_pages"] == package["total_pages"]
        assert [entry["page_number"] for entry in di_index["entries"]] == list(range(1, 89))
        assert isinstance(json.loads(payloads[f"/api/agent-runs?projectId={project_id}"]), list)
        assert json.loads(payloads[f"/api/db-projects/projects/{project_id}/project-graph/rab-bridge/proposals"]) == []

        # The known human-approved source fact is passed through unchanged.  The
        # expected length anchor is 4.5 m; TypeScript and this test do not derive it.
        request = {
            "project_id": project_id,
            "snapshot_id": "SNAPSHOT-50AD5202D5BDBE3A",
            "measurement_fact_ids": ["mf-plhut-001"],
            "calculation_type": "length",
            "requested_by": "paax-web",
            "inputs": [{
                "measurement_id": "mf-plhut-001", "project_id": project_id,
                "snapshot_id": "SNAPSHOT-50AD5202D5BDBE3A", "measurement_type": "length",
                "value": 4.5, "unit": "m", "source_method": "written_dimension",
                "element_ids": ["ELTYPE-ED7E4B7D3942989A873D368FF3DC9AF93EADF6B81BDA83DDDC84F777D8B954BD"],
                "evidence_refs": ["EV-PLHUT-001"], "formula_inputs": ["length"],
                "verification_status": "human_verified", "created_by": "paax-web", "audit_metadata": {},
            }],
        }
        status, body = self._post_web("/api/core-engine/calculations", request)
        assert status == 200, f"Core Engine calculation must return 200 through web, got {status}"
        result = json.loads(body)
        assert result["status"] == "complete"
        assert result["result"] == 4.5 and result["unit"] == "m"
