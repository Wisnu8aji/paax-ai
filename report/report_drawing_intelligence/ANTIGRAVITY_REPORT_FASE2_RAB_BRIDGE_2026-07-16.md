# ANTIGRAVITY REPORT FASE 2: RAB BRIDGE HTTP ENDPOINT

- **Date:** 2026-07-16
- **Status:** Completed
- **Author:** Antigravity (Advanced Agentic Coding Assistant)

---

## 1. PENDAHULUAN
Laporan ini merinci implementasi HTTP endpoint untuk RAB bridge (`build_rab_bridge_proposal`) di `services/db`. Integrasi ini merupakan bagian dari Fase 2 untuk membuka akses programmatik yang aman (read-only) bagi Command Room setelah stabilitasnya terkonfirmasi di Fase 1.

Sesuai dengan **Aturan Emas** proyek, tidak ada kalkulasi aritmatika (volume, harga, durasi, dsb.) yang dilakukan di backend FastAPI/TypeScript maupun database layer. Endpoint ini semata-mata mengonversi request dari client, memanggil logic bridge deterministik yang aman, dan mengembalikan data node + evidence untuk persetujuan manual manusia di frontend/Command Room.

---

## 2. PERUBAHAN KODE / IMPLEMENTASI
Berikut adalah detail perubahan berkas yang telah dilakukan (uncommitted):

### A. Modifikasi `services/db/src/paax_db/schemas.py`
Menambahkan skema Pydantic untuk request dan response RAB bridge agar selaras dengan format data internal:
```python
class RabBridgeRequest(BaseModel):
    node_ids: List[str]


class RabBridgeResponse(BaseModel):
    status: str
    snapshot_id: Optional[str] = None
    items: List[Dict[str, Any]] = Field(default_factory=list)
```

### B. Modifikasi `services/db/src/paax_db/main.py`
1. Mengimpor fungsi `build_rab_bridge_proposal`:
   ```python
   from .project_graph_rab_bridge import build_rab_bridge_proposal
   ```
2. Menambahkan endpoint POST `/projects/{id}/project-graph/rab-bridge`:
   ```python
   @app.post(
       "/projects/{id}/project-graph/rab-bridge",
       response_model=schemas.RabBridgeResponse,
       dependencies=[Depends(RoleChecker(["estimator", "pm", "lapangan", "owner"]))],
   )
   async def create_rab_bridge_proposal(
       id: str, request: schemas.RabBridgeRequest, db: AsyncSession = Depends(get_db)
   ):
       proposal = await build_rab_bridge_proposal(db, project_id=id, node_ids=request.node_ids)
       return proposal
   ```

### C. Modifikasi `services/db/tests/test_project_graph_rab_bridge.py`
Menambahkan 3 test integration baru di tingkat HTTP menggunakan `ASGITransport` dan `AsyncClient`:
1. `test_rab_bridge_endpoint_success_for_lapangan`: Menguji skenario sukses saat snapshot aktif tersedia, memverifikasi role `"lapangan"`, dan memastikan response mengembalikan proposal dengan data node & evidence yang benar tanpa modifikasi kalkulasi aritmatika.
2. `test_rab_bridge_endpoint_graph_not_ready`: Menguji skenario ketika project belum memiliki snapshot aktif yang memicu status `"graph_not_ready"`.
3. `test_rab_bridge_endpoint_role_rejection`: Menguji validasi role checker di mana role `"guest"` yang tidak berwenang akan menghasilkan status HTTP 403.

---

## 3. HASIL PENGUJIAN (TEST SUITE RUN)
Seluruh pengujian dijalankan secara lokal di sistem user. Berikut adalah hasil eksekusi riil:

### A. Hasil Test `services/db`
Eksekusi: `python -m pytest` di `services/db`.
```
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0
collected 35 items

tests\test_alembic_migrations.py s                                       [  2%]
tests\test_command_room_memory.py ...                                    [ 11%]
tests\test_dem_runs.py .                                                 [ 14%]
tests\test_knowledge.py .                                                [ 17%]
tests\test_project_graph_corrections.py .                                [ 20%]
tests\test_project_graph_persistence.py .....                            [ 34%]
tests\test_project_graph_rab_bridge.py ....                              [ 45%]
tests\test_project_graph_retrieval.py ............                       [ 80%]
tests\test_reports.py ...                                                [ 88%]
tests\test_usage.py ....                                                 [100%]
================= 34 passed, 1 skipped, 3 warnings in 14.74s ==================
```

### B. Hasil Test `services/document-intelligence` (Non-Regresi)
Eksekusi: `python -m pytest` di `services/document-intelligence`.
```
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0
collected 416 items

(seluruh 416 tests dijalankan)
================= 411 passed, 5 skipped, 2 warnings in 22.05s =================
```

Tidak ada regresi atau kegagalan pengujian yang terdeteksi di luar modul `services/db`.

---

## 4. KEPATUHAN ATURAN EMAS (GOLDEN RULE CONFIRMATION)
Kami mengonfirmasi secara eksplisit bahwa:
- **TIDAK ADA** kalkulasi volume, durasi, bobot, harga satuan, atau nilai RAB yang didefinisikan, dihitung, atau dimodifikasi pada endpoint `POST /projects/{id}/project-graph/rab-bridge`.
- Logika bridge semata-mata bersifat **Read-Only** untuk menarik data snapshot dan memformatnya menjadi proposal dengan status `"requires_human_approval"` atau `"graph_not_ready"`.
- Semua data yang ditarik murni berasal dari graph database (`ProjectGraphNode` & `ProjectGraphNodeEvidence`) untuk kemudian diverifikasi secara manual oleh pengguna manusia.

Semua pekerjaan diselesaikan sesuai dengan branch saat ini tanpa melakukan commit langsung ke `main`, menjaga status worktree tetap *uncommitted*.
