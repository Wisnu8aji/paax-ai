"""
Test endpoint CRUD untuk quantity_assumptions.

Endpoint yang diuji:
  POST   /projects/{id}/project-graph/quantity-assumptions
  GET    /projects/{id}/project-graph/quantity-assumptions
  POST   /projects/{id}/project-graph/quantity-assumptions/{assumption_id}/resolve

Aturan yang ditegakkan:
  - Aturan Emas: endpoint tidak menghitung apa pun -- murni simpan teks asumsi manusia + status
  - D12: approval selalu aksi manusia eksplisit via endpoint resolve; TIDAK ada auto-accept
  - RBAC: create/list = estimator/pm/lapangan/owner; resolve = owner/pm saja
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from paax_db import models
from paax_db.main import app


HEADERS_PM = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-PM"}
HEADERS_ESTIMATOR = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-ESTIMATOR"}
HEADERS_LAPANGAN = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-LAPANGAN"}
HEADERS_GUEST = {"X-Internal-Key": "test-internal-key", "X-User-Id": "USER-GUEST"}


async def _setup_project(session, *, project_id: str = "PROJ-QA"):
    """Buat proyek dan tambahkan anggota standar untuk pengujian."""
    session.add(models.Project(id=project_id, owner_id="USER-OWNER", name="Proyek QA"))
    session.add(models.ProjectMember(project_id=project_id, user_id="USER-PM", role="pm"))
    session.add(models.ProjectMember(project_id=project_id, user_id="USER-ESTIMATOR", role="estimator"))
    session.add(models.ProjectMember(project_id=project_id, user_id="USER-LAPANGAN", role="lapangan"))
    session.add(models.ProjectMember(project_id=project_id, user_id="USER-GUEST", role="guest"))
    await session.commit()


# ---------------------------------------------------------------------------
# POST /projects/{id}/project-graph/quantity-assumptions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_quantity_assumption_success():
    """Create sukses oleh estimator, response harus memuat semua field yang dikirim."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={
                "id": "ASSUMP-001",
                "project_id": "PROJ-QA",
                "element_type_id": "KOLOM-K1",
                "text": "Tinggi kolom K1 diasumsikan 3.5m berdasarkan denah tipikal lantai 2",
                "source_role": "estimator",
                "status": "active",
            },
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "ASSUMP-001"
    assert data["project_id"] == "PROJ-QA"
    assert data["element_type_id"] == "KOLOM-K1"
    assert data["text"] == "Tinggi kolom K1 diasumsikan 3.5m berdasarkan denah tipikal lantai 2"
    assert data["source_role"] == "estimator"
    assert data["status"] == "active"
    assert data["created_at"] is not None
    # Aturan Emas: response tidak mengandung kalkulasi apa pun
    assert "volume" not in data
    assert "amount" not in data
    assert "calculated" not in data


@pytest.mark.asyncio
async def test_create_quantity_assumption_by_lapangan():
    """Role lapangan juga boleh membuat asumsi."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={
                "id": "ASSUMP-LAP-001",
                "project_id": "PROJ-QA",
                "text": "Asumsi lapangan: tebal plat 12cm di semua lantai",
                "source_role": "lapangan",
                "status": "active",
            },
            headers=HEADERS_LAPANGAN,
        )

    assert res.status_code == 200
    assert res.json()["source_role"] == "lapangan"


@pytest.mark.asyncio
async def test_create_quantity_assumption_project_id_mismatch_rejected():
    """project_id di body yang tidak cocok dengan path harus ditolak (400)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={
                "id": "ASSUMP-BAD",
                "project_id": "PROJ-BEDA",  # tidak cocok dengan path PROJ-QA
                "text": "Teks asumsi",
                "source_role": "estimator",
            },
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 400
    assert "project_id" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_quantity_assumption_duplicate_id_rejected():
    """ID asumsi yang sudah ada harus ditolak (409)."""
    from .conftest import TestSession

    payload = {
        "id": "ASSUMP-DUP",
        "project_id": "PROJ-QA",
        "text": "Asumsi pertama",
        "source_role": "estimator",
    }

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Buat pertama kali
        res1 = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json=payload,
            headers=HEADERS_ESTIMATOR,
        )
        assert res1.status_code == 200

        # Coba buat lagi dengan ID yang sama
        res2 = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={**payload, "text": "Asumsi kedua dengan ID sama"},
            headers=HEADERS_ESTIMATOR,
        )

    assert res2.status_code == 409


@pytest.mark.asyncio
async def test_create_quantity_assumption_role_rejection():
    """Guest tidak boleh membuat asumsi."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={
                "id": "ASSUMP-GUEST",
                "project_id": "PROJ-QA",
                "text": "Asumsi dari guest",
                "source_role": "guest",
            },
            headers=HEADERS_GUEST,
        )

    assert res.status_code == 403


# ---------------------------------------------------------------------------
# GET /projects/{id}/project-graph/quantity-assumptions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_quantity_assumptions_returns_all():
    """List mengembalikan semua asumsi proyek tanpa filter."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Buat 3 asumsi
        for i in range(1, 4):
            await client.post(
                "/projects/PROJ-QA/project-graph/quantity-assumptions",
                json={
                    "id": f"ASSUMP-{i:03d}",
                    "project_id": "PROJ-QA",
                    "element_type_id": f"TYPE-{i}",
                    "text": f"Asumsi nomor {i}",
                    "source_role": "estimator",
                },
                headers=HEADERS_ESTIMATOR,
            )

        # List tanpa filter
        res = await client.get(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 3
    ids = {a["id"] for a in data}
    assert ids == {"ASSUMP-001", "ASSUMP-002", "ASSUMP-003"}


@pytest.mark.asyncio
async def test_list_quantity_assumptions_filter_by_element_type_id():
    """Filter by element_type_id mengembalikan subset yang benar."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Asumsi untuk TYPE-KOLOM
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "A-KOLOM-1", "project_id": "PROJ-QA", "element_type_id": "TYPE-KOLOM", "text": "Tinggi kolom 3.5m", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "A-KOLOM-2", "project_id": "PROJ-QA", "element_type_id": "TYPE-KOLOM", "text": "Dimensi kolom 40x40cm", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )
        # Asumsi untuk TYPE-BALOK
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "A-BALOK-1", "project_id": "PROJ-QA", "element_type_id": "TYPE-BALOK", "text": "Lebar balok 30cm", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        # Filter by element_type_id=TYPE-KOLOM
        res = await client.get(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            params={"element_type_id": "TYPE-KOLOM"},
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert all(a["element_type_id"] == "TYPE-KOLOM" for a in data)


@pytest.mark.asyncio
async def test_list_quantity_assumptions_empty_project():
    """Proyek tanpa asumsi mengembalikan list kosong (bukan 404 atau error)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_list_quantity_assumptions_only_returns_own_project():
    """List hanya mengembalikan asumsi proyek yang diminta, bukan milik proyek lain."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session, project_id="PROJ-QA")
        # Proyek kedua dengan owner sama agar bisa akses
        session.add(models.Project(id="PROJ-OTHER", owner_id="USER-OWNER", name="Proyek Lain"))
        session.add(models.ProjectMember(project_id="PROJ-OTHER", user_id="USER-ESTIMATOR", role="estimator"))
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Buat asumsi di PROJ-QA
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "A-QA-1", "project_id": "PROJ-QA", "text": "Asumsi QA", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )
        # Buat asumsi di PROJ-OTHER
        await client.post(
            "/projects/PROJ-OTHER/project-graph/quantity-assumptions",
            json={"id": "A-OTHER-1", "project_id": "PROJ-OTHER", "text": "Asumsi Other", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        # List PROJ-QA harus hanya mengembalikan asumsi PROJ-QA
        res = await client.get(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            headers=HEADERS_ESTIMATOR,
        )

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["id"] == "A-QA-1"


# ---------------------------------------------------------------------------
# POST /projects/{id}/project-graph/quantity-assumptions/{assumption_id}/resolve
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolve_quantity_assumption_accepted():
    """PM bisa mengubah status asumsi jadi 'accepted' (D12: approval manusia eksplisit)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Buat asumsi
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-RESOLVE", "project_id": "PROJ-QA", "text": "Tinggi plat 12cm", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        # PM resolve ke accepted
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-RESOLVE/resolve",
            json={"status": "accepted"},
            headers=HEADERS_PM,
        )

    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "ASSUMP-RESOLVE"
    assert data["status"] == "accepted"


@pytest.mark.asyncio
async def test_resolve_quantity_assumption_rejected():
    """PM bisa mengubah status asumsi jadi 'rejected'."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-REJ", "project_id": "PROJ-QA", "text": "Asumsi yang akan ditolak", "source_role": "lapangan"},
            headers=HEADERS_LAPANGAN,
        )

        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-REJ/resolve",
            json={"status": "rejected"},
            headers=HEADERS_PM,
        )

    assert res.status_code == 200
    assert res.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_resolve_assumption_not_found_returns_404():
    """assumption_id yang tidak ada harus mengembalikan 404 yang jelas."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/TIDAK-ADA/resolve",
            json={"status": "accepted"},
            headers=HEADERS_PM,
        )

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resolve_assumption_wrong_project_returns_404():
    """assumption_id dari proyek berbeda harus mengembalikan 404 (project_id tidak cocok)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session, project_id="PROJ-QA")
        session.add(models.Project(id="PROJ-OTHER", owner_id="USER-OWNER", name="Proyek Lain"))
        session.add(models.ProjectMember(project_id="PROJ-OTHER", user_id="USER-PM", role="pm"))
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Buat asumsi di PROJ-OTHER
        await client.post(
            "/projects/PROJ-OTHER/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-OTHER", "project_id": "PROJ-OTHER", "text": "Asumsi di proyek lain", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        # Coba resolve dari PROJ-QA -- harus 404 karena assumption tidak ada di PROJ-QA
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-OTHER/resolve",
            json={"status": "accepted"},
            headers=HEADERS_PM,
        )

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_resolve_assumption_invalid_status_rejected():
    """Status yang tidak valid (misal 'pending') harus ditolak oleh Pydantic validation (422)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-VAL", "project_id": "PROJ-QA", "text": "Asumsi untuk validasi", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        # "pending" bukan Literal["accepted", "rejected"]
        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-VAL/resolve",
            json={"status": "pending"},
            headers=HEADERS_PM,
        )

    assert res.status_code == 422


@pytest.mark.asyncio
async def test_resolve_assumption_role_rejection_estimator():
    """Estimator tidak boleh menggunakan endpoint resolve (hanya owner/pm) -- D12."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-RBAC", "project_id": "PROJ-QA", "text": "Asumsi RBAC test", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )

        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-RBAC/resolve",
            json={"status": "accepted"},
            headers=HEADERS_ESTIMATOR,  # estimator TIDAK boleh
        )

    assert res.status_code == 403


@pytest.mark.asyncio
async def test_resolve_assumption_role_rejection_lapangan():
    """Lapangan tidak boleh menggunakan endpoint resolve -- D12."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-LAP-RBAC", "project_id": "PROJ-QA", "text": "Asumsi lapangan", "source_role": "lapangan"},
            headers=HEADERS_LAPANGAN,
        )

        res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-LAP-RBAC/resolve",
            json={"status": "accepted"},
            headers=HEADERS_LAPANGAN,  # lapangan TIDAK boleh
        )

    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Aturan Emas: endpoint tidak mengandung kalkulasi
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_calculation_fields_in_any_response():
    """Semua respons endpoint quantity_assumptions tidak mengandung field kalkulasi (Aturan Emas)."""
    from .conftest import TestSession

    async with TestSession() as session:
        await _setup_project(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            json={"id": "ASSUMP-GR", "project_id": "PROJ-QA", "text": "Asumsi aturan emas", "source_role": "estimator"},
            headers=HEADERS_ESTIMATOR,
        )
        list_res = await client.get(
            "/projects/PROJ-QA/project-graph/quantity-assumptions",
            headers=HEADERS_ESTIMATOR,
        )
        resolve_res = await client.post(
            "/projects/PROJ-QA/project-graph/quantity-assumptions/ASSUMP-GR/resolve",
            json={"status": "accepted"},
            headers=HEADERS_PM,
        )

    forbidden_fields = {"volume", "amount", "price", "calculated", "computed", "angka"}
    for res in [create_res, resolve_res]:
        data = res.json()
        assert not any(f in data for f in forbidden_fields), f"Field kalkulasi ditemukan di response: {data}"
    for item in list_res.json():
        assert not any(f in item for f in forbidden_fields), f"Field kalkulasi ditemukan di list response: {item}"
