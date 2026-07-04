"""
PAAX Document Intelligence — Rakit persepsi vektor -> TkgDocument (Fase 2 P3).

Menggabungkan P1 (span/merge-run) + P2 (grammar) + `page.find_tables()`
PyMuPDF menjadi `TkgDocument` kanonik (mirror `app.perception.tkg.models`).

CAKUPAN JUJUR ITERASI INI (bukan §3 brain-00 penuh — dicatat, bukan
disembunyikan, selaras INV-TKG-02/AP-E-04):
- TABEL: direkonstruksi dari `page.find_tables()` (rangka garis nyata,
  §3.2) — bekerja penuh untuk tabel BERGARIS. Tabel tanpa garis (murni
  kedekatan teks) belum tertangani (deferred).
- GRID: DUA sumber digabung. (1) Geometri: bubble-as (lingkaran vektor) +
  garis-dimensi (angka antar-bubble), lihat `vector/grid_geometry.py` —
  menghasilkan `sumbu_x`/`sumbu_y` (label + posisi_mm KUMULATIF nyata dari
  rantai bentang) + `bentang_x`/`bentang_y` + `total_x`/`total_y` (HANYA bila
  cocok penjumlahan, tidak dipaksakan) + `offset_tepi` (§3.1.1c). (2) Notasi
  eksplisit "<as>-<as>=<nilai>" per Run (fallback tambahan bila ada notasi
  teks yang tidak tercakup geometri). YANG BELUM: garis-as itu sendiri tidak
  diverifikasi ulang (deteksi murni bertumpu pada bubble+label+angka, cukup
  untuk skema kanonik); grid 3D/isometrik atau bubble non-lingkaran (mis.
  segi-enam) di luar cakupan.
- ELEMEN: dihitung dari Run yang cocok `parse_type_code` di luar tabel/grid;
  alamat grid (§5 binding, `app/perception/binding.py`) SUDAH diikat ke
  posisi nyata (interseksi "A1" atau offset "B-offset_sebelum_1") sejak
  rencana besar 2026-07-05 — diverifikasi cocok PERSIS ke posisi PC1/PC2/PC3
  PLHUT nyata (`test_smoke_real_plhut_footplat_alamat_matches_reference_
  positions`). `count_simbol` MASIH None (deteksi simbol grafis, brain V-05):
  investigasi `page.get_drawings()` pada simbol footplat PLHUT nyata
  menemukan bentuknya (kotak besar + garis silang diagonal + kotak kecil
  di tengah) SANGAT spesifik ke konvensi drafter ybs — beda drafter/CAD bisa
  memakai simbol sama sekali berbeda (X polos, lingkaran, dll). Membangun
  detektor yang benar² generalisasi (bukan overfit satu konvensi PLHUT,
  §0.1) butuh riset lebih dalam dari yang dibenarkan sesi ini — SENGAJA
  ditunda jujur, bukan dipaksakan jadi fitur setengah-jadi yang rapuh.
- Sisanya (Run yang tak cocok grid/tabel/kode/level) -> UNCLASSIFIED, sesuai
  INV-TKG-02 zero-loss (tidak dibuang).
- RASTER (Fase 2 P6): sheet tanpa text-layer vektor (RULE-EXT-30) dibaca via
  PaddleOCR BILA terpasang (dependency opsional/lazy — lihat
  `app/perception/ocr/paddle_ocr_extractor.py`); span hasil OCR mengalir ke
  pipeline SAMA (merge-run/grammar) dengan `method="ocr"` & confidence < 1.0
  (RULE-EXT-31). Sheet VEKTOR TIDAK PERNAH melalui jalur OCR (RULE-EXT-05).
"""
from __future__ import annotations

import re
import tempfile
from typing import Callable, Optional
from pathlib import Path

import fitz

from app.perception.binding import bind_alamat
from app.perception.grammar.level import parse_level
from app.perception.grammar.mutu import parse_mutu
from app.perception.grammar.rebar import parse_rebar
from app.perception.grammar.section import parse_section
from app.perception.grammar.type_code import parse_type_code
from app.perception.ingest.raster_detector import is_raster_sheet
from app.perception.ingest.span_extractor import extract_spans_from_page
from app.perception.ocr.paddle_ocr_extractor import extract_spans_via_ocr
from app.perception.lexicon.units import infer_unit
from app.perception.models import Run
from app.perception.params import DIMS_RANGE
from app.perception.tkg.models import (
    ElementInstance,
    Grid,
    GridSpan,
    GridTotal,
    Level,
    RebarSpec,
    SheetMeta,
    TkgDocument,
    TkgSheet,
    TkgTable,
    TypeRecord,
    Unclassified,
)
from app.perception.vector.grid_geometry import reconstruct_grid_from_geometry
from app.perception.vector.merge_run import merge_runs
from app.perception.zone_classifier import classify_zone, extract_judul, extract_skala
from app.processors.drawing_classifier import DrawingClassifier
from app.tkg.builder import classification_to_jenis

_GRID_SPAN_PATTERN = re.compile(r"^([A-Za-z0-9]+)-([A-Za-z0-9]+)=(\d+(?:\.\d+)?)$")
_GRID_TOTAL_PATTERN = re.compile(r"^TOTAL\s+([A-Za-z0-9]+)-([A-Za-z0-9]+)=(\d+(?:\.\d+)?)$", re.IGNORECASE)
_ALPHA_LABEL = re.compile(r"^[A-Za-z]+$")
_NUMERIC_LABEL = re.compile(r"^\d+$")

_HEADER_KODE = {"kode", "type", "tipe"}
_HEADER_DIMENSI = {"dimensi", "b x h", "bxh", "penampang"}
_HEADER_TUL_UTAMA = {"tul atas", "tul utama", "tulangan utama", "tulangan"}
_HEADER_SENGKANG = {"sengkang", "begel"}
_HEADER_MUTU = {"mutu", "mutu beton", "fc"}


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", h.lower()).strip()


def _classify_header(h: str) -> str | None:
    n = _normalize_header(h)
    if n in _HEADER_KODE:
        return "kode"
    if n in _HEADER_DIMENSI:
        return "dimensi"
    if n in _HEADER_TUL_UTAMA:
        return "tul_utama"
    if n in _HEADER_SENGKANG:
        return "sengkang"
    if n in _HEADER_MUTU:
        return "mutu"
    return None


def _cell(row: list[str], col_roles: list[str | None], role: str) -> str | None:
    for i, r in enumerate(col_roles):
        if r == role and i < len(row) and row[i]:
            return row[i]
    return None


def _extract_tables(page: "fitz.Page") -> tuple[list[TkgTable], list[tuple[float, float, float, float]]]:
    tables: list[TkgTable] = []
    bboxes: list[tuple[float, float, float, float]] = []
    try:
        found = page.find_tables()
    except Exception:
        return tables, bboxes

    for t_index, tbl in enumerate(found.tables):
        rows = tbl.extract()
        if len(rows) < 2:
            continue
        header = [h or "" for h in rows[0]]
        col_roles = [_classify_header(h) for h in header]
        if "kode" not in col_roles:
            continue

        records: list[TypeRecord] = []
        for row in rows[1:]:
            row = [c or "" for c in row]
            kode_cell = _cell(row, col_roles, "kode")
            if not kode_cell:
                continue
            code_result = parse_type_code(kode_cell.strip())
            kode = code_result.kode_raw if code_result else kode_cell.strip()
            kategori = code_result.kategori if code_result else None

            dimensi: dict[str, float] = {}
            satuan_dimensi = "mm"
            dim_cell = _cell(row, col_roles, "dimensi")
            if dim_cell:
                sec = parse_section(dim_cell.strip())
                if sec and sec.b is not None and sec.h is not None:
                    unit_res = infer_unit((sec.b, sec.h), kategori or "kolom", DIMS_RANGE)
                    dimensi = {"b": sec.b, "h": sec.h}
                    satuan_dimensi = unit_res.satuan or "mm"

            tulangan: list[RebarSpec] = []
            tul_cell = _cell(row, col_roles, "tul_utama")
            if tul_cell:
                rb = parse_rebar(tul_cell.strip())
                if rb and rb.kind == "pokok":
                    tulangan.append(RebarSpec(posisi="tul_utama", raw=rb.raw, jumlah=rb.n, diameter_mm=rb.d, jenis=rb.jenis))
            sengkang_cell = _cell(row, col_roles, "sengkang")
            if sengkang_cell:
                rb = parse_rebar(sengkang_cell.strip())
                if rb and rb.kind == "sebar":
                    tulangan.append(RebarSpec(posisi="sengkang", raw=rb.raw, diameter_mm=rb.d, jarak_mm=rb.s, jenis=rb.jenis))

            mutu_cell = _cell(row, col_roles, "mutu")
            mutu_beton = parse_mutu(mutu_cell.strip()).raw if mutu_cell and parse_mutu(mutu_cell.strip()) else None

            records.append(TypeRecord(
                kode=kode, kategori=kategori, dimensi=dimensi, satuan_dimensi=satuan_dimensi,
                tulangan=tulangan, mutu_beton=mutu_beton,
                raw_cells={header[i]: row[i] for i in range(min(len(header), len(row)))},
            ))
        if records:
            tables.append(TkgTable(judul=f"tabel_terdeteksi_{t_index + 1}", records=records))
            bboxes.append(tuple(float(v) for v in tbl.bbox))
    return tables, bboxes


def _extract_grid_from_notation(runs: list[Run]) -> tuple[Grid, set[str]]:
    bentang_x: list[GridSpan] = []
    bentang_y: list[GridSpan] = []
    total_x: GridTotal | None = None
    total_y: GridTotal | None = None
    used_ids: set[str] = set()

    for run in runs:
        text = run.text.strip()
        m = _GRID_TOTAL_PATTERN.match(text)
        if m:
            a, b, val = m.group(1), m.group(2), float(m.group(3))
            total = GridTotal(dari=a, ke=b, nilai=val, raw=text)
            if _ALPHA_LABEL.match(a) and _ALPHA_LABEL.match(b):
                total_x = total
            elif _NUMERIC_LABEL.match(a) and _NUMERIC_LABEL.match(b):
                total_y = total
            else:
                continue
            used_ids.add(run.run_id)
            continue

        m = _GRID_SPAN_PATTERN.match(text)
        if m:
            a, b, val = m.group(1), m.group(2), float(m.group(3))
            span = GridSpan(dari=a, ke=b, nilai=val, raw=text)
            if _ALPHA_LABEL.match(a) and _ALPHA_LABEL.match(b):
                bentang_x.append(span)
            elif _NUMERIC_LABEL.match(a) and _NUMERIC_LABEL.match(b):
                bentang_y.append(span)
            else:
                continue
            used_ids.add(run.run_id)

    grid = Grid(bentang_x=bentang_x, bentang_y=bentang_y, total_x=total_x, total_y=total_y)
    return grid, used_ids


def _extract_grid(page: "fitz.Page", runs: list[Run]) -> tuple[Grid, set[str], dict[str, dict[str, float]]]:
    """Gabung geometri (bubble+garis-dimensi, §3.1.1) dengan notasi eksplisit
    teks sebagai pelengkap. Geometri jadi sumber utama `sumbu_x`/`sumbu_y`
    (notasi TIDAK PERNAH menghasilkan itu); bentang/total notasi ditambahkan
    HANYA bila pasangan (dari,ke) belum tercakup geometri (tidak dobel).
    `axis_points` (posisi titik PDF asli per label as) diteruskan ke Fase C
    (label->grid binding) -- kosong bila grid HANYA dari notasi (tak ada
    posisi titik nyata utk dibandingkan ke bbox elemen)."""
    notation_grid, notation_used = _extract_grid_from_notation(runs)
    geo_grid, geo_used, axis_points = reconstruct_grid_from_geometry(page, runs)
    if geo_grid is None:
        return notation_grid, notation_used, {"x": {}, "y": {}}

    existing_x = {(s.dari, s.ke) for s in geo_grid.bentang_x}
    existing_y = {(s.dari, s.ke) for s in geo_grid.bentang_y}
    bentang_x = list(geo_grid.bentang_x) + [s for s in notation_grid.bentang_x if (s.dari, s.ke) not in existing_x]
    bentang_y = list(geo_grid.bentang_y) + [s for s in notation_grid.bentang_y if (s.dari, s.ke) not in existing_y]

    grid = Grid(
        sumbu_x=geo_grid.sumbu_x, sumbu_y=geo_grid.sumbu_y,
        bentang_x=bentang_x, bentang_y=bentang_y,
        total_x=geo_grid.total_x or notation_grid.total_x,
        total_y=geo_grid.total_y or notation_grid.total_y,
        offset_tepi=geo_grid.offset_tepi,
    )
    return grid, geo_used | notation_used, axis_points


def _extract_levels(runs: list[Run]) -> tuple[list[Level], set[str]]:
    levels: list[Level] = []
    used_ids: set[str] = set()
    for run in runs:
        lv = parse_level(run.text.strip())
        if lv:
            levels.append(Level(label_raw=lv.raw, nilai_m=lv.nilai_m))
            used_ids.add(run.run_id)
    return levels, used_ids


def _run_inside_any_bbox(run: Run, bboxes: list[tuple[float, float, float, float]]) -> bool:
    rx0, ry0, rx1, ry1 = run.bbox
    for bx0, by0, bx1, by1 in bboxes:
        if rx0 >= bx0 - 1 and ry0 >= by0 - 1 and rx1 <= bx1 + 1 and ry1 <= by1 + 1:
            return True
    return False


def _extract_elements(
    runs: list[Run],
    used_ids: set[str],
    grid: Grid,
    axis_points: dict[str, dict[str, float]],
) -> tuple[list[ElementInstance], list[Unclassified]]:
    """`used_ids` sudah mencakup run grid/level/di-dalam-tabel (dihitung sekali
    oleh caller, §4.2 P4) — di sini tinggal klasifikasi sisa run bebas.

    Fase C (§5 binding): tiap instance kode diikat ke alamat grid NYATA via
    `binding.bind_alamat` menggunakan posisi titik PDF asli (`axis_points`,
    BUKAN posisi_mm — lihat docstring `_extract_grid`). Kalau sheet ini tidak
    punya grid dari geometri (axis_points kosong), binding jujur tidak
    dilakukan — bukan ditebak."""
    kode_bboxes: dict[str, list[tuple[float, float, float, float]]] = {}
    unclassified: list[Unclassified] = []

    for run in runs:
        if run.run_id in used_ids:
            continue
        text = run.text.strip()
        if not text:
            continue
        code_result = parse_type_code(text)
        if code_result and not code_result.needs_review:
            kode_bboxes.setdefault(code_result.kode_raw, []).append(run.bbox)
            continue
        unclassified.append(Unclassified(
            raw=text,
            alasan="tidak cocok grammar kode/level/grid (§2)",
        ))

    axis_x = axis_points.get("x", {})
    axis_y = axis_points.get("y", {})
    elements: list[ElementInstance] = []
    for kode, bboxes in kode_bboxes.items():
        alamat_list: list[str] = []
        any_needs_review = False
        for bbox in bboxes:
            alamat, needs_review = bind_alamat(bbox, axis_x, axis_y)
            alamat_list.append(alamat)
            any_needs_review = any_needs_review or needs_review
        n = len(bboxes)
        elements.append(ElementInstance(
            kode=kode,
            alamat=", ".join(alamat_list),
            alamat_list=alamat_list,
            alamat_needs_review=any_needs_review,
            n=n, count_label=n, count_simbol=None,
        ))
    return elements, unclassified


def assemble_sheet_from_page(page: "fitz.Page", page_index: int, sheet_id: str, judul: str) -> tuple[TkgSheet, dict]:
    """Kembalikan (TkgSheet, metrics) — metrics dipakai P4 utk METRICS/gerbang.

    `run_total`/`run_terklasifikasi` dihitung dari UNIT RUN (pasca merge-run),
    bukan span mentah — proksi V-01 (INV-TKG-02 zero-loss): tiap run masuk ke
    SATU kategori (grid/level/tabel/elemen) atau `unclassified`, tidak pernah
    dibuang begitu saja.
    """
    is_raster, n_vector_spans = is_raster_sheet(page)
    ocr_message: str | None = None

    if is_raster:
        # RULE-EXT-30: sheet raster (scan/foto) -> jalur OCR opsional/lazy.
        # RULE-EXT-05 dijaga secara STRUKTURAL: cabang vektor di bawah tidak
        # pernah dieksekusi untuk sheet yang terbukti raster.
        with tempfile.TemporaryDirectory() as tmp_dir:
            png_path = str(Path(tmp_dir) / "page.png")
            page.get_pixmap(dpi=200).save(png_path)
            ocr_result = extract_spans_via_ocr(png_path, page_index)
        spans = ocr_result.spans
        if not ocr_result.available:
            ocr_message = ocr_result.message
    else:
        spans = extract_spans_from_page(page, page_index)

    runs = merge_runs(spans)

    tables, table_bboxes = _extract_tables(page) if not is_raster else ([], [])
    grid, grid_run_ids, axis_points = _extract_grid(page, runs)
    levels, level_run_ids = _extract_levels(runs)
    table_covered_ids = {r.run_id for r in runs if _run_inside_any_bbox(r, table_bboxes)}
    judul_extracted, judul_run_ids = extract_judul(runs)
    skala, skala_run_ids = extract_skala(runs)
    # judul/skala SUNGGUH dipakai (jadi zona+meta sheet) -> ikut terklasifikasi,
    # bukan unclassified (Fase B, rencana besar 2026-07-05).
    used_ids = grid_run_ids | level_run_ids | table_covered_ids | judul_run_ids | skala_run_ids
    elements, unclassified = _extract_elements(runs, used_ids, grid, axis_points)

    joined_text = " ".join(r.text for r in runs)
    classifier_res = DrawingClassifier().process(joined_text)
    jenis = classification_to_jenis(classifier_res["classification"])

    judul_asli = judul_extracted or judul
    zone = classify_zone(judul_asli)

    sheet = TkgSheet(
        sheet_id=sheet_id, jenis=jenis,
        meta=SheetMeta(judul=judul_asli, skala=skala, zone=zone),
        grid=grid, levels=levels, tables=tables, elements=elements,
        unclassified=unclassified,
    )

    run_total = len(runs)
    n_unclassified = len(unclassified)
    n_classified = run_total - n_unclassified
    cakupan = (n_classified / run_total) if run_total else 1.0
    metrics = {
        "run_total": run_total,
        "run_terklasifikasi": n_classified,
        "n_unclassified": n_unclassified,
        "cakupan": cakupan,
        "classification": classifier_res["classification"],
        "classification_confidence": classifier_res["confidence"],
        "needs_vision_fallback": classifier_res["needs_vision_fallback"],
        "is_raster": is_raster,
        "n_vector_spans": n_vector_spans,
        "ocr_message": ocr_message,
    }
    return sheet, metrics


def assemble_document_from_pdf_bytes(
    pdf_bytes: bytes, prj_id: str, rev_id: str = "R0", title_prefix: str = "Sheet",
    on_page_done: Optional[Callable[[int, int], None]] = None,
) -> tuple[TkgDocument, list[dict]]:
    """Kembalikan (TkgDocument, metrics per-sheet) — dipakai P4 utk agregasi METRICS.

    `on_page_done(index_selesai, total_halaman)` opsional (Fase F, proses
    latar belakang) — dipanggil setelah tiap halaman selesai supaya caller
    bisa melaporkan progres nyata (bukan simulasi/animasi buta)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        sheets: list[TkgSheet] = []
        per_sheet_metrics: list[dict] = []
        total = len(doc)
        for i in range(total):
            sheet, metrics = assemble_sheet_from_page(doc.load_page(i), i, f"S{i + 1:02d}", f"{title_prefix} {i + 1}")
            sheets.append(sheet)
            per_sheet_metrics.append(metrics)
            if on_page_done is not None:
                on_page_done(i + 1, total)
        return TkgDocument(prj_id=prj_id, rev_id=rev_id, generated_by="pipeline", sheets=sheets), per_sheet_metrics
    finally:
        doc.close()
