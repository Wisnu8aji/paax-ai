"""
PAAX Document Intelligence — Konsolidasi lintas-halaman (Fase E, rencana
besar 2026-07-05: `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`).

Menggabungkan hasil per-sheet (`TkgDocument.sheets`, masing-masing sudah
diproses independen oleh `assemble.py`) jadi SATU pandangan bangunan:
- Grid kanonik: pilih grid TERLENGKAP (paling banyak as) sbg acuan; grid
  sheet lain yang berbagi label as tapi beda posisi_mm -> DITANDAI konflik
  (Assumption dampak tinggi), TIDAK ditimpa diam-diam (cikal-bakal V-02/V-03).
- Registry elemen lintas-zona: instance dari SEMUA sheet dikumpulkan per
  kode, definisi tabel (dimensi/tulangan/mutu) diikat ke kode yang sama.
- Assumption ledger: unclassified + elemen yg alamat-nya perlu-review dari
  SEMUA sheet, dgn rujukan halaman asal (tidak hilang per-sheet).
- Dimensi bangunan: dari total_x/total_y grid kanonik (mm), sumber dicatat
  jujur (bukan ditebak kalau tidak tersedia).
"""
from __future__ import annotations

from app.perception.consolidated_models import (
    Assumption,
    BuildingDimensions,
    ConsolidatedExtraction,
    ElementDefinisi,
    ElementInstanceRef,
    ElementRegistryEntry,
    SheetSummary,
)
from app.perception.tkg.models import Grid, TkgDocument

_POSISI_MM_TOLERANCE = 1.0


def _pick_canonical_grid(doc: TkgDocument) -> tuple[Grid | None, int | None]:
    candidates = [
        (i, sheet.grid) for i, sheet in enumerate(doc.sheets)
        if sheet.grid is not None and (sheet.grid.sumbu_x or sheet.grid.sumbu_y)
    ]
    if not candidates:
        return None, None
    idx, grid = max(candidates, key=lambda t: len(t[1].sumbu_x) + len(t[1].sumbu_y))
    return grid, idx


def _grid_conflicts(doc: TkgDocument, canonical_grid: Grid, canonical_idx: int) -> list[Assumption]:
    canon_pos = {a.label: a.posisi_mm for a in list(canonical_grid.sumbu_x) + list(canonical_grid.sumbu_y)}
    conflicts: list[Assumption] = []
    for i, sheet in enumerate(doc.sheets):
        if i == canonical_idx or sheet.grid is None:
            continue
        for axis in list(sheet.grid.sumbu_x) + list(sheet.grid.sumbu_y):
            if axis.label not in canon_pos:
                continue
            canon_val = canon_pos[axis.label]
            if canon_val is None or axis.posisi_mm is None:
                continue
            if abs(axis.posisi_mm - canon_val) > _POSISI_MM_TOLERANCE:
                conflicts.append(Assumption(
                    pernyataan=(
                        f"Grid as '{axis.label}' beda posisi antara sheet {canonical_idx + 1} "
                        f"({canon_val:.0f}mm) dan sheet {i + 1} ({axis.posisi_mm:.0f}mm)"
                    ),
                    alasan="Grid seharusnya konsisten di seluruh sheet bangunan yang sama (brain V-02/V-03)",
                    sheet_page=i + 1, dampak="tinggi",
                ))
    return conflicts


def consolidate_document(doc: TkgDocument) -> ConsolidatedExtraction:
    sheets = [
        SheetSummary(
            page=i + 1, sheet_id=sheet.sheet_id, zone=sheet.meta.zone,
            judul=sheet.meta.judul, skala=sheet.meta.skala,
        )
        for i, sheet in enumerate(doc.sheets)
    ]

    canonical_grid, canonical_idx = _pick_canonical_grid(doc)
    assumptions: list[Assumption] = []
    if canonical_grid is not None and canonical_idx is not None:
        assumptions.extend(_grid_conflicts(doc, canonical_grid, canonical_idx))

    registry: dict[str, ElementRegistryEntry] = {}
    for i, sheet in enumerate(doc.sheets):
        for element in sheet.elements:
            entry = registry.setdefault(element.kode, ElementRegistryEntry(kode=element.kode))
            addresses = element.alamat_list or ([element.alamat] if element.alamat else [])
            for alamat in addresses:
                entry.instances.append(ElementInstanceRef(sheet_page=i + 1, alamat=alamat))
            if element.alamat_needs_review:
                entry.status = "perlu_review"
                assumptions.append(Assumption(
                    pernyataan=f"Alamat grid untuk elemen '{element.kode}' tidak sepenuhnya yakin di sheet {i + 1}",
                    alasan="Posisi elemen tidak match rapi ke grid manapun di sheet ini",
                    sheet_page=i + 1, dampak="sedang",
                ))

        for table in sheet.tables:
            for record in table.records:
                entry = registry.setdefault(record.kode, ElementRegistryEntry(kode=record.kode))
                entry.kategori = entry.kategori or record.kategori
                if entry.definisi is None and (record.dimensi or record.tulangan or record.mutu_beton):
                    entry.definisi = ElementDefinisi(
                        dimensi=record.dimensi, satuan_dimensi=record.satuan_dimensi,
                        tulangan=record.tulangan, mutu_beton=record.mutu_beton,
                        sumber_halaman=i + 1,
                    )

        for unclassified in sheet.unclassified:
            assumptions.append(Assumption(
                pernyataan=f"Teks '{unclassified.raw}' tidak dikenali di sheet {i + 1}",
                alasan=unclassified.alasan, sheet_page=i + 1, dampak="rendah",
            ))

    building_dimensions = BuildingDimensions()
    if canonical_grid is not None:
        if canonical_grid.total_x is not None:
            building_dimensions.total_x_mm = canonical_grid.total_x.nilai
        if canonical_grid.total_y is not None:
            building_dimensions.total_y_mm = canonical_grid.total_y.nilai
        if building_dimensions.total_x_mm is not None or building_dimensions.total_y_mm is not None:
            building_dimensions.sumber = "grid"

    return ConsolidatedExtraction(
        sheets=sheets,
        grid=canonical_grid,
        element_registry=list(registry.values()),
        assumptions=assumptions,
        building_dimensions=building_dimensions,
    )
