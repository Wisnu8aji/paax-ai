from __future__ import annotations

import os

os.environ.setdefault("INTERNAL_SERVICE_KEY", "test-internal-key")

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import dem_routes
from app.artifact_storage import LocalArtifactStore
from app.main import app

HEADERS = {"X-Internal-Key": "test-internal-key"}


def test_dem_routes_are_registered():
    """Assert the public DEM contract via the OpenAPI schema.

    FastAPI's ``app.routes`` may hold lazily-resolved wrapper objects
    depending on installed version (see ``fastapi.routing._IncludedRouter``),
    so walking it directly is not a stable contract. ``app.openapi()`` is
    the actual public, version-stable surface clients and tooling rely on.
    """
    paths = app.openapi().get("paths", {})
    registered = {
        (path, method.upper())
        for path, methods in paths.items()
        for method in methods
    }
    expected = {
        ("/drawings/dem/start", "POST"),
        ("/drawings/dem/{run_id}/status", "GET"),
        ("/drawings/dem/{run_id}/synthesize", "POST"),
        ("/drawings/dem/{run_id}/intelligence", "GET"),
        ("/drawings/dem/{run_id}/tools/one-click-area", "POST"),
        ("/drawings/dem/{run_id}/tools/one-click-line", "POST"),
        ("/drawings/dem/{run_id}/tools/find-similar", "POST"),
        ("/drawings/dem/{run_id}/intelligence/items/{work_item_id}/calculate", "POST"),
        ("/drawings/dem/{run_id}/pages/{page_index}/image", "GET"),
        ("/drawings/dem/{run_id}/artifact-url", "POST"),
        ("/drawings/dem/{run_id}/artifact", "GET"),
        ("/drawings/dem/{run_id}/artifact", "DELETE"),
    }
    assert expected <= registered


from unittest.mock import patch, MagicMock
from unittest.mock import AsyncMock
import tempfile

@pytest.mark.asyncio
async def test_get_page_image_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run:
            import httpx
            mock_response = httpx.Response(404, request=httpx.Request("GET", "http://test"))
            mock_get_run.side_effect = httpx.HTTPStatusError("not found", request=mock_response.request, response=mock_response)
            
            response = await ac.get("/drawings/dem/invalid-run/pages/0/image", headers=HEADERS)
            assert response.status_code == 404
            assert response.json()["detail"] == "DEM run not found"


@pytest.mark.asyncio
async def test_get_page_image_valid_and_cached():
    with tempfile.TemporaryDirectory() as tmp_dir:
        import fitz
        doc = fitz.open()
        doc.new_page(width=100, height=100)
        pdf_bytes = doc.tobytes()
        doc.close()

        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        artifact_key = store.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact") as authorize, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            
            mock_get_run.return_value = {
                "id": "run-123",
                    "artifact_key": artifact_key,
                    "project_id": "PROJECT-A",
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/0/image", headers=HEADERS)
                assert response.status_code == 200
                assert response.headers["content-type"] == "image/png"
                png_bytes = response.content
                assert len(png_bytes) > 0



@pytest.mark.asyncio
async def test_get_page_image_out_of_bounds():
    with tempfile.TemporaryDirectory() as tmp_dir:
        import fitz
        doc = fitz.open()
        doc.new_page(width=100, height=100)
        pdf_bytes = doc.tobytes()
        doc.close()

        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        artifact_key = store.put("original-pdf", pdf_bytes, content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run") as mock_get_run, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            
            mock_get_run.return_value = {
                "id": "run-123",
                "artifact_key": artifact_key,
                "total_pages": 1,
            }

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                response = await ac.get("/drawings/dem/run-123/pages/5/image", headers=HEADERS)
                assert response.status_code == 404
            assert response.json()["detail"] == "Page index out of bounds"


@pytest.mark.asyncio
async def test_signed_artifact_url_is_bound_to_its_project_key_and_expiry(monkeypatch):
    """A signed link cannot be replayed for a different project/key or after expiry."""
    monkeypatch.setenv("ARTIFACT_SIGNING_SECRET", "test-signing-secret")
    run = {"id": "run-123", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-123/source.pdf"}
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        store.put("original-pdf", b"%PDF-1.7", content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
             patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})), \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                issued = await ac.post("/drawings/dem/run-123/artifact-url", headers=HEADERS)
                assert issued.status_code == 200
                token = issued.json()["token"]
                valid = await ac.get(f"/drawings/dem/run-123/artifact?token={token}", headers=HEADERS)
                assert valid.status_code == 200

                other = dict(run, project_id="PROJECT-B")
                with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=other)):
                    denied = await ac.get(f"/drawings/dem/run-123/artifact?token={token}", headers=HEADERS)
                assert denied.status_code == 403

                expired = token.split(".", 1)[1]
                denied = await ac.get(f"/drawings/dem/run-123/artifact?token=1.{expired}", headers=HEADERS)
                assert denied.status_code == 403


@pytest.mark.asyncio
async def test_artifact_deletion_is_owner_authorized_audited_and_rate_limited():
    run = {"id": "run-123", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-123/source.pdf"}
    dem_routes._RATE.clear()
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = LocalArtifactStore(__import__("pathlib").Path(tmp_dir))
        store.put("original-pdf", b"%PDF-1.7", content_type="application/pdf", object_key="runs/run-123/source.pdf")
        with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
             patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
             patch("app.api.dem_routes.DemDbClient.mark_artifact_deleted", new=AsyncMock()) as mark_deleted, \
             patch.object(dem_routes, "ARTIFACT_STORE", store):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                deleted = await ac.delete("/drawings/dem/run-123/artifact", headers=HEADERS)
            assert deleted.status_code == 200
            assert not store.exists(run["artifact_key"])
            mark_deleted.assert_awaited_once_with("run-123", actor_id="service-account")

    dem_routes._RATE.clear()
    for _ in range(30):
        dem_routes._rate_limit("actor", "project", "read")
    with pytest.raises(Exception) as limited:
        dem_routes._rate_limit("actor", "project", "read")
    assert getattr(limited.value, "status_code", None) == 429


@pytest.mark.asyncio
async def test_issuing_artifact_url_fails_closed_without_a_configured_signing_secret(monkeypatch):
    """A prior audit found ARTIFACT_SIGNING_SECRET falls back to a predictable
    "development-only-artifact-secret" whenever the env var is unset -- a
    misconfigured production deployment would silently sign artifact URLs
    with a secret anyone reading the source already knows. This proves the
    fallback now only applies under an explicit TESTING=1 flag."""
    monkeypatch.delenv("ARTIFACT_SIGNING_SECRET", raising=False)
    monkeypatch.delenv("TESTING", raising=False)
    run = {"id": "run-500", "project_id": "PROJECT-A", "artifact_key": "original-pdf/runs/run-500/source.pdf"}
    with patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.get_artifact_retention", new=AsyncMock(return_value={"deleted_at": None})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/drawings/dem/run-500/artifact-url", headers=HEADERS)
    assert response.status_code == 500


@pytest.mark.asyncio
async def test_package_intelligence_summary_and_full_views_are_project_authorized(tmp_path):
    payload = {
        "schema_version": "paax.drawing-intelligence.package.v1",
        "package_id": "run-run-1",
        "document_name": "plan.pdf",
        "document_sha256": "synthetic-plan-sha256",
        "page_count": 88,
        "metrics": {
            "analysis_mode": "fast", "analyzed_pages": 88, "vocabulary_entries": 147,
            "cross_references": 285, "work_item_candidates": 1,
        },
        "phase_status": {"01_ingestion": "implemented"},
        "warnings": [],
        "work_items": [{
            "work_item_id": "wi-k2", "category": "column", "code": "K2",
            "label": "Column K2", "maturity": "review_ready",
            "occurrence_count_observed": 3, "page_indices": [42],
            "missing_information": ["classification"],
            "attributes": {"dimensions": {"width": 250, "depth": 600}},
            "evidence_refs": ["ev-k2"],
            "review_task_ids": ["review-k2"],
        }],
        "review_queue": [{
            "task_id": "review-k2", "page_index": 42, "task_type": "work_item",
            "title": "Klarifikasi klasifikasi K2", "reason": "Klasifikasi elemen belum pasti",
            "severity": "review", "status": "open",
        }],
    }
    store = LocalArtifactStore(tmp_path)
    store.put(
        "drawing-intelligence",
        __import__("json").dumps(payload).encode(),
        content_type="application/json",
        object_key="runs/run-1/package-analysis.json",
    )
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value={"id": "run-1", "project_id": "PROJECT-A"})), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()) as authorize:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            summary = await client.get("/drawings/dem/run-1/intelligence", headers=HEADERS)
            full = await client.get("/drawings/dem/run-1/intelligence?view=full", headers=HEADERS)
    assert summary.status_code == 200
    assert summary.json()["work_items"][0]["observed_label_count"] == 3
    assert summary.json()["work_items"][0]["count_is_final"] is False
    assert summary.json()["review_task_count"] == 1
    assert full.status_code == 200
    assert full.json()["work_items"][0]["evidence_refs"] == ["ev-k2"]
    assert authorize.await_count == 2
    assert all(call.args == ("service-account", "PROJECT-A") for call in authorize.await_args_list)


@pytest.mark.asyncio
async def test_package_intelligence_rejects_invalid_view_and_missing_artifact(tmp_path):
    with patch.object(dem_routes, "ARTIFACT_STORE", LocalArtifactStore(tmp_path)), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value={"id": "run-1", "project_id": "PROJECT-A"})), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            invalid = await client.get("/drawings/dem/run-1/intelligence?view=unknown", headers=HEADERS)
            missing = await client.get("/drawings/dem/run-1/intelligence", headers=HEADERS)
    assert invalid.status_code == 422
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_run_scoped_vector_tools_use_authorized_stored_pdf(tmp_path):
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    page.draw_rect(fitz.Rect(340, 100, 540, 260), color=(0, 0, 0))
    pdf = doc.tobytes()
    doc.close()

    store = LocalArtifactStore(tmp_path)
    artifact_key = store.put(
        "original-pdf", pdf, content_type="application/pdf", object_key="runs/run-tools/source.pdf"
    )
    run = {
        "id": "run-tools", "project_id": "PROJECT-A",
        "artifact_key": artifact_key, "total_pages": 1,
    }
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            area = await client.post(
                "/drawings/dem/run-tools/tools/one-click-area", headers=HEADERS,
                json={"page_index": 0, "positive_points": [[0.2, 0.3]], "negative_points": []},
            )
            line = await client.post(
                "/drawings/dem/run-tools/tools/one-click-line", headers=HEADERS,
                json={"page_index": 0, "point": [0.09, 0.2]},
            )
            similar = await client.post(
                "/drawings/dem/run-tools/tools/find-similar", headers=HEADERS,
                json={
                    "page_index": 0,
                    "positive_bboxes": [{"x0": 80/900, "y0": 100/600, "x1": 280/900, "y1": 260/600, "space": "normalized"}],
                    "negative_bboxes": [],
                    "threshold": 0.65,
                },
            )
    assert area.status_code == 200
    assert area.json()["authority"] == "measurement_candidate"
    assert area.json()["final_quantity"] is False
    assert line.status_code == 200
    assert line.json()["scaled_value"] is None
    assert similar.status_code == 200
    assert similar.json()["count_semantics"] == "candidate_detection_not_verified_physical_count"
    assert len(similar.json()["candidates"]) >= 2


@pytest.mark.asyncio
async def test_package_intelligence_review_endpoint_persists_versioned_human_decision(tmp_path):
    import fitz
    from app.drawing_intelligence.pipeline import analyze_drawing_package

    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    page.insert_text((150, 180), "K1", fontsize=16)
    page.draw_rect(fitz.Rect(620, 80, 860, 250), color=(0, 0, 0))
    page.insert_text((640, 110), "KETERANGAN", fontsize=14)
    page.insert_text((640, 145), "K1 400 x 400 mm KOLOM BETON", fontsize=11)
    pdf = doc.tobytes()
    doc.close()
    analysis = analyze_drawing_package(pdf, document_name="review.pdf", mode="deep")
    item = next(row for row in analysis.work_items if row.code == "K1")

    store = LocalArtifactStore(tmp_path)
    store.put(
        "drawing-intelligence",
        analysis.model_dump_json(indent=2).encode(),
        content_type="application/json",
        object_key="runs/run-review/package-analysis.json",
    )
    run = {"id": "run-review", "project_id": "PROJECT-A"}
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            accepted = await client.post(
                "/drawings/dem/run-review/intelligence/reviews",
                headers=HEADERS,
                json={
                    "work_item_id": item.work_item_id,
                    "action": "accept",
                    "expected_version": 0,
                    "reason": "Klasifikasi dan evidence telah diperiksa pada lembar sumber.",
                },
            )
            refreshed = await client.get("/drawings/dem/run-review/intelligence", headers=HEADERS)
            stale = await client.post(
                "/drawings/dem/run-review/intelligence/reviews",
                headers=HEADERS,
                json={
                    "work_item_id": item.work_item_id,
                    "action": "reject",
                    "expected_version": 0,
                    "reason": "Keputusan dari browser lama tidak boleh menimpa versi terbaru.",
                },
            )

    assert accepted.status_code == 200
    assert accepted.json()["ledger_version"] == 1
    assert refreshed.status_code == 200
    reviewed = next(row for row in refreshed.json()["work_items"] if row["work_item_id"] == item.work_item_id)
    assert reviewed["status"] == "accepted"
    assert reviewed["count_is_final"] is False  # classification acceptance is not a physical-count approval
    assert refreshed.json()["review_ledger"]["version"] == 1
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_project_prototype_registry_roundtrips_through_canonical_artifact_key(tmp_path):
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=900, height=600)
    page.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    pdf = doc.tobytes()
    doc.close()

    store = LocalArtifactStore(tmp_path)
    artifact_key = store.put(
        "original-pdf", pdf, content_type="application/pdf", object_key="runs/run-prototype/source.pdf"
    )
    run = {
        "id": "run-prototype", "project_id": "PROJECT-A", "artifact_key": artifact_key,
        "document_hash": "sha256:prototype-document", "total_pages": 1,
    }
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()), \
         patch("app.api.dem_routes.DemDbClient.authorize_artifact", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/drawings/dem/run-prototype/intelligence/prototypes",
                headers=HEADERS,
                json={
                    "name": "Kolom K1 proyek",
                    "category": "column",
                    "expected_latest_version": 0,
                    "samples": [{
                        "page_index": 0, "label": "positive",
                        "bbox": {"x0": 80/900, "y0": 100/600, "x1": 280/900, "y1": 260/600, "space": "normalized"},
                    }],
                },
            )
            listed = await client.get(
                "/drawings/dem/run-prototype/intelligence/prototypes", headers=HEADERS
            )

    assert created.status_code == 200
    assert created.json()["version"] == 1
    assert listed.status_code == 200
    assert len(listed.json()["versions"]) == 1
    assert listed.json()["versions"][0]["name"] == "Kolom K1 proyek"

@pytest.mark.asyncio
async def test_mature_work_item_calculation_persists_and_survives_refresh(tmp_path):
    import fitz
    from app.drawing_intelligence.models import ElementMeasurementFact
    from app.drawing_intelligence.pipeline import analyze_drawing_package

    doc = fitz.open()
    plan = doc.new_page(width=900, height=600)
    plan.insert_text((80, 55), "DENAH KOLOM LANTAI 2", fontsize=16)
    plan.draw_rect(fitz.Rect(80, 100, 280, 260), color=(0, 0, 0))
    plan.draw_rect(fitz.Rect(340, 100, 540, 260), color=(0, 0, 0))
    plan.insert_text((150, 180), "K1", fontsize=16)
    plan.insert_text((410, 180), "K1", fontsize=16)
    schedule = doc.new_page(width=900, height=600)
    schedule.insert_text((80, 55), "TABEL KOLOM", fontsize=16)
    schedule.insert_text((100, 145), "K1 400 x 400 mm", fontsize=11)
    pdf = doc.tobytes()
    doc.close()

    analysis = analyze_drawing_package(pdf, document_name="calc.pdf", mode="deep")
    item = next(value for value in analysis.work_items if value.code == "K1")
    facts = [
        ElementMeasurementFact(
            measurement_id=f"mf-k1-{field}", work_item_id=item.work_item_id,
            field=field, value=value, unit=unit, source_method=method,
            verification_status="engine_verified", evidence_refs=[f"ev-{field}"],
            source_page_indices=[0 if field in {"count", "height"} else 1], formula_input=field,
        )
        for field, value, unit, method in [
            ("count", 2, "unit", "verified_instances"),
            ("width", 400, "mm", "written_dimension"),
            ("depth", 400, "mm", "written_dimension"),
            ("height", 3000, "mm", "geometry_engine"),
        ]
    ]
    mature = item.model_copy(update={
        "verified_physical_count": 2,
        "count_authority": "engine_confirmed",
        "physical_instance_ids": ["inst-k1-1", "inst-k1-2"],
        "measurement_facts": facts,
        "calculation_readiness": "ready",
        "conflict_ids": [],
    })
    analysis = analysis.model_copy(update={
        "work_items": [mature if value.work_item_id == item.work_item_id else value for value in analysis.work_items]
    })

    store = LocalArtifactStore(tmp_path)
    store.put(
        "drawing-intelligence", analysis.model_dump_json(indent=2).encode(),
        content_type="application/json", object_key="runs/run-calc/package-analysis.json",
    )
    run = {"id": "run-calc", "project_id": "PROJECT-A"}
    client_mock = MagicMock()
    client_mock.calculate = AsyncMock(return_value={
        "calculation_id": "calc-k1-total", "status": "complete",
        "formula": "width * depth * height * count",
        "substituted_formula": "0.4 * 0.4 * 3.0 * 2",
        "result": 0.96, "unit": "m3", "warnings": [], "engine_version": "test-core-engine",
    })
    with patch.object(dem_routes, "ARTIFACT_STORE", store), \
         patch("app.api.dem_routes.DemDbClient.get_run", new=AsyncMock(return_value=run)), \
         patch("app.api.dem_routes.DemDbClient.authorize_actor_for_project", new=AsyncMock()), \
         patch("app.api.dem_routes.CoreEngineCalculationClient.from_env", return_value=client_mock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            calculated = await client.post(
                f"/drawings/dem/run-calc/intelligence/items/{item.work_item_id}/calculate",
                headers=HEADERS,
            )
            refreshed = await client.get("/drawings/dem/run-calc/intelligence", headers=HEADERS)

    assert calculated.status_code == 200, calculated.text
    assert calculated.json()["result"] == 0.96
    assert calculated.json()["unit"] == "m3"
    client_mock.calculate.assert_awaited_once()
    request = client_mock.calculate.await_args.args[0]
    assert request["calculation_type"] == "concrete_column_total_volume"
    assert {value["formula_inputs"][0] for value in request["inputs"]} == {"count", "width", "depth", "height"}
    assert refreshed.status_code == 200
    refreshed_item = next(
        value for value in [*refreshed.json()["work_items"], *refreshed.json()["needs_clarification"]]
        if value["work_item_id"] == item.work_item_id
    )
    assert refreshed_item["calculation"]["result"] == 0.96
    assert refreshed_item["calculation_readiness"] == "calculated"
