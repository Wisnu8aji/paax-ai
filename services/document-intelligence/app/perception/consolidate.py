"""
PAAX Document Intelligence — Konsolidasi lintas-halaman (Fase E, rencana
besar 2026-07-05: `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`).

Menggabungkan hasil per-sheet (`TkgDocument.sheets`, masing-masing sudah
diproses independen oleh `assemble.py`) jadi SATU pandangan bangunan:
- Grid kanonik: pilih grid TERLENGKAP (paling banyak as) sbg acuan; grid
  sheet lain yang berbagi >=2 label as dgn JARAK RELATIF beda -> DITANDAI
  konflik (Assumption dampak tinggi, satu ringkasan per axis, bukan per
  pasangan sheet), TIDAK ditimpa diam-diam (cikal-bakal V-02/V-03).
- Registry elemen lintas-zona: instance dari SEMUA sheet dikumpulkan per
  kode, definisi tabel (dimensi/tulangan/mutu) diikat ke kode yang sama.
- Assumption ledger: unclassified (SETELAH difilter teks metadata
  administratif berulang, Fase U) + elemen yg alamat-nya perlu-review dari
  SEMUA sheet, dgn rujukan halaman asal (tidak hilang per-sheet).
- Dimensi bangunan: dari total_x/total_y grid kanonik (mm), sumber dicatat
  jujur (bukan ditebak kalau tidak tersedia).

Fase U (2026-07-13, `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-
07-13.md`): dua bug noise diperbaiki di sini setelah bukti nyata screenshot
aplikasi (`G:\\gambar contoh`) menunjukkan "PERLU DICEK" meledak jadi ribuan
item nyaris tak actionable — (1) `_grid_conflicts` sebelumnya membandingkan
`posisi_mm` ABSOLUT antar sheet (bug identik V-03 core-engine yang sudah
diperbaiki Fase M-2, versi ini luput saat itu krn beda service) sehingga
axis yang sama menghasilkan satu Assumption PER PASANGAN sheet; sekarang
memakai jarak RELATIF ke anchor label bersama, dan hasil konflik per axis
diringkas jadi SATU Assumption yang menyebut semua sheet bermasalah. (2)
teks unclassified sebelumnya 100% masuk assumptions tanpa filter, termasuk
kop administratif ("KEMENTERIAN...", "TAHUN ANGGARAN...", dst) yang
berulang di hampir tiap halaman; sekarang difilter oleh `_is_admin_metadata`
(keyword generik + heuristik frekuensi lintas-sheet), TIDAK dibuang dari
data (tetap ada di `sheet.unclassified` mentah), hanya tidak lagi jadi
"perlu dicek" ke user.
"""
from __future__ import annotations

from functools import lru_cache
import re

from app.perception.ai_assist.client import AiAssistClient
from app.perception.ai_assist.dimension_assist import suggest_footplat_dimensions
from app.perception.ai_assist.kusen_assist import suggest_kusen_schedule
from app.perception.ai_assist.mep_assist import suggest_mep_points
from app.perception.ai_assist.roof_frame_assist import suggest_roof_frame_dimensions
from app.perception.ai_assist.wall_assist import suggest_dinding_pasangan
from app.perception.ai_assist.zone_assist import suggest_zone
from app.perception.consolidated_models import (
    Assumption,
    BuildingDimensions,
    ConsolidatedExtraction,
    ElementDefinisi,
    ElementInstanceRef,
    ElementRegistryEntry,
    SheetSummary,
)
from app.perception.tkg.models import Grid, TkgDocument, TkgSheet
from paax_schemas.tkg_taxonomy import kategori_dari_kode, known_tkg_categories

_POSISI_MM_TOLERANCE = 1.0

# Fase U.3 — pola label kop/header administratif proyek yang generik
# (BUKAN spesifik PLHUT, konsisten §0.1 fixture-bukan-template): field kop
# gambar standar Indonesia + istilah instansi pemerintah umum.
_ADMIN_TEXT_PATTERN = re.compile(
    r"KEMENTERIAN|KEMENTRIAN|DIREKTORAT\s+JENDERAL|DIREKTORAT\b|DINAS\b|"
    r"PEMERINTAH\b|KANTOR\s+WILAYAH|TAHUN\s+ANGGARAN|JUDUL\s+PROYEK|"
    r"NO\.?\s*GBR|SKALA\s+GBR|KODE\s+GBR|^DIGAMBAR\b|^DIPERIKSA\b|"
    r"^DISETUJUI\b|^PARAF\b|PEKERJAAN\s+JASA\s+KONSULTANSI|PENYELENGGARAAN\b",
    re.IGNORECASE,
)
# Teks identik (setelah normalisasi spasi+kapital) yang muncul di >= N sheet
# berbeda dianggap kop/footer berulang, bukan konten teknis per-halaman.
_ADMIN_REPEAT_MIN_SHEETS = 3


@lru_cache(maxsize=1)
def _tkg_prefix_categories() -> tuple[str, ...]:
    """Kategori teknis dari taksonomi bersama, dipakai untuk normalisasi kode."""
    return tuple(sorted(category.upper() for category in known_tkg_categories()))


@lru_cache(maxsize=1)
def _generic_element_tokens() -> set[str]:
    tokens: set[str] = set()
    for category in _tkg_prefix_categories():
        tokens.update(part for part in category.replace("_", " ").split() if part)
    return tokens


def _remember_raw_code(entry: ElementRegistryEntry, raw: str) -> None:
    value = raw.strip()
    if value and value not in entry.kode_asli:
        entry.kode_asli.append(value)


def _normalize_kode(raw: str) -> str:
    text = _normalize_text(raw)
    text = text.replace('"', " ").replace("'", " ")
    text = re.sub(r"[^A-Z0-9\-\s]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return raw.strip().upper()

    tokens = text.split()
    generic_tokens = _generic_element_tokens()
    while len(tokens) > 1 and tokens[0] in generic_tokens:
        tokens.pop(0)
    text = " ".join(tokens)

    text = re.sub(r"^([A-Z]+)[\s-]+(\d+[A-Z]*)$", r"\1\2", text)
    text = re.sub(r"\s+", "", text)
    return text or raw.strip().upper()


def _normalize_text(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.strip()).upper()


def _is_admin_metadata(raw: str, sheet_occurrence_count: int) -> bool:
    text = raw.strip()
    if not text:
        return False
    if _ADMIN_TEXT_PATTERN.search(text):
        return True
    return sheet_occurrence_count >= _ADMIN_REPEAT_MIN_SHEETS


def _pick_canonical_grid(doc: TkgDocument) -> tuple[Grid | None, int | None]:
    candidates = [
        (i, sheet.grid) for i, sheet in enumerate(doc.sheets)
        if sheet.grid is not None and (sheet.grid.sumbu_x or sheet.grid.sumbu_y)
    ]
    if not candidates:
        return None, None
    idx, grid = max(candidates, key=lambda t: len(t[1].sumbu_x) + len(t[1].sumbu_y))
    return grid, idx


def _axis_map_mm(grid: Grid, sumbu: str) -> dict[str, float]:
    axes = grid.sumbu_x if sumbu == "x" else grid.sumbu_y
    return {axis.label: axis.posisi_mm for axis in axes if axis.posisi_mm is not None}


def _grid_conflicts(doc: TkgDocument, canonical_grid: Grid, canonical_idx: int) -> list[Assumption]:
    """V-02/V-03 ala consolidate: bandingkan jarak RELATIF antar label as yang
    sama-sama muncul (bukan posisi_mm absolut -- tiap halaman punya origin
    sendiri, pola identik `core-engine/app/tkg/validate.py::_cek_v03`).
    Konflik per axis diringkas jadi SATU Assumption yang menyebut semua sheet
    bermasalah, bukan satu per pasangan (mencegah ledakan noise nyata yang
    ditemukan di `G:\\gambar contoh`: 9+ baris nyaris identik utk 1 axis)."""
    conflicts: list[Assumption] = []
    for sumbu in ("x", "y"):
        canon_pos = _axis_map_mm(canonical_grid, sumbu)
        if len(canon_pos) < 2:
            continue
        # label -> daftar (sheet_page, jarak_relatif_kanonik, jarak_relatif_sheet)
        by_label: dict[str, list[tuple[int, float, float]]] = {}
        for i, sheet in enumerate(doc.sheets):
            if i == canonical_idx or sheet.grid is None:
                continue
            sheet_pos = _axis_map_mm(sheet.grid, sumbu)
            shared = sorted(set(canon_pos) & set(sheet_pos))
            if len(shared) < 2:
                continue
            anchor = shared[0]
            for label in shared[1:]:
                rel_canon = canon_pos[label] - canon_pos[anchor]
                rel_sheet = sheet_pos[label] - sheet_pos[anchor]
                if abs(rel_canon - rel_sheet) <= _POSISI_MM_TOLERANCE:
                    continue
                by_label.setdefault(label, []).append((i + 1, rel_canon, rel_sheet))
        for label, entries in sorted(by_label.items()):
            pages = ", ".join(str(p) for p, _, _ in entries)
            _, rel_canon, _ = entries[0]
            conflicts.append(Assumption(
                pernyataan=(
                    f"Grid as '{label}' (sumbu {sumbu}) beda jarak relatif terhadap sheet "
                    f"acuan {canonical_idx + 1} (rel {rel_canon:.0f}mm) di {len(entries)} "
                    f"sheet: {pages}"
                ),
                alasan="Jarak relatif antar-as seharusnya konsisten di seluruh bangunan yang sama (brain V-02/V-03)",
                sheet_page=entries[0][0], dampak="tinggi",
            ))
    return conflicts


def _sheet_mentions_kode(sheet: TkgSheet, entry: ElementRegistryEntry) -> bool:
    """Fase X2 -- cek apakah sheet detail memuat label kode elemen ini
    (mis. teks lepas "PC 1" di halaman detail), TOLERAN ke variasi
    penulisan (spasi/strip) via `_normalize_kode` yang sudah dipakai utk
    registry lintas-halaman (Fase V)."""
    target_codes = {entry.kode, *entry.kode_asli}
    normalized_targets = {_normalize_kode(code) for code in target_codes}
    return any(_normalize_kode(item.raw) in normalized_targets for item in sheet.unclassified)


def _collect_detail_texts(doc: TkgDocument, entry: ElementRegistryEntry) -> list[str]:
    """Fase X2 -- kumpulkan SEMUA teks `unclassified` (span yang sudah
    diekstrak PyMuPDF, BUKAN piksel) dari sheet `detail_tabel` yang memuat
    label kode elemen ini. Ini konteks yang dikirim ke AI-assist -- validasi
    anti-halusinasi di `dimension_assist.py` memastikan usulan model hanya
    boleh merujuk teks yang benar-benar ada di daftar ini."""
    texts: list[str] = []
    for sheet in doc.sheets:
        if sheet.meta.zone != "detail_tabel":
            continue
        if not _sheet_mentions_kode(sheet, entry):
            continue
        texts.extend(item.raw for item in sheet.unclassified)
    return texts


def _apply_dimension_ai_assist(
    doc: TkgDocument,
    registry: dict[str, ElementRegistryEntry],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 slice #1 -- fallback paralel utk kategori `pondasi_telapak`
    yang dimensinya kosong dari rule-based (temuan X1/X1B). TIDAK PERNAH
    dipanggil kalau rule-based SUDAH berhasil (dimensi terisi) -- rule-based
    tetap fast-path, AI hanya mengisi kekosongan."""
    for entry in registry.values():
        if (entry.kategori or "").strip().lower() != "pondasi_telapak":
            continue
        existing_dimensi = entry.definisi.dimensi if entry.definisi else {}
        if existing_dimensi:
            continue
        detail_texts = _collect_detail_texts(doc, entry)
        if not detail_texts:
            continue
        suggestion = suggest_footplat_dimensions(
            entry.kode, entry.kode_asli, detail_texts, ai_client,
        )
        if suggestion is not None:
            entry.ai_dimension_suggestion = suggestion


_ROOF_FRAME_CATEGORIES = ("gording", "trekstang", "ikatan_angin")


def _apply_roof_frame_ai_assist(
    doc: TkgDocument,
    registry: dict[str, ElementRegistryEntry],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 lanjutan (2026-07-05) -- slice #4: rangka atap non-beton.
    Pola PERSIS `_apply_dimension_ai_assist` (X1/footplat): kategori SUDAH
    dikenali & entry SUDAH ada di registry (kode GORDING/GD, TS, IA) --
    gap murni bridging+kelengkapan dimensi, bukan gap deteksi (beda dari
    dinding). `kuda_kuda` SENGAJA tidak dicakup (butuh designasi profil
    baja, gap terpisah)."""
    for entry in registry.values():
        kategori = (entry.kategori or "").strip().lower()
        if kategori not in _ROOF_FRAME_CATEGORIES:
            continue
        required = {
            "gording": ("l_miring_sisi_m", "s_gording_m", "l_arah_gording_m", "n_sisi_atap"),
            "trekstang": ("panjang_per_batang_m", "jumlah"),
            "ikatan_angin": ("a_m", "b_m", "qty"),
        }[kategori]
        existing_dimensi = entry.definisi.dimensi if entry.definisi else {}
        if all(name in existing_dimensi for name in required):
            continue
        detail_texts = _collect_detail_texts(doc, entry)
        if not detail_texts:
            continue
        suggestion = suggest_roof_frame_dimensions(
            kategori, entry.kode, entry.kode_asli, detail_texts, ai_client,
        )
        if suggestion is not None:
            entry.ai_roof_frame_suggestion = suggestion


_KODE_SANITIZE_PATTERN = re.compile(r"[^A-Z0-9]+")


def _apply_mep_ai_assist(
    doc: TkgDocument,
    registry: dict[str, ElementRegistryEntry],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 lanjutan (2026-07-05) -- slice #6 (TERAKHIR): titik MEP.
    Pola sama kusen (dokumen-luas, bisa banyak entry sekaligus) TAPI HANYA
    dari catatan jumlah eksplisit -- deteksi simbol/ikon dari piksel TIDAK
    dicoba (di luar cakupan lapisan AI-assist berbasis-teks)."""
    all_texts: list[str] = []
    for sheet in doc.sheets:
        all_texts.extend(item.raw for item in sheet.unclassified)
    suggestions = suggest_mep_points(all_texts, ai_client)
    for suggestion in suggestions:
        safe_jenis = _KODE_SANITIZE_PATTERN.sub("", suggestion.jenis.upper()) or "TITIK"
        kode = f"MEP-AUTO-{safe_jenis}"
        if kode in registry:
            continue
        registry[kode] = ElementRegistryEntry(
            kode=kode,
            kategori="mep",
            status="perlu_review",
            ai_mep_suggestion=suggestion,
        )


def _apply_kusen_ai_assist(
    doc: TkgDocument,
    registry: dict[str, ElementRegistryEntry],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 lanjutan (2026-07-05) -- slice #5: jadwal kusen pintu/jendela.
    Pola sama dinding (dokumen-luas, entry sintetis) TAPI bisa menghasilkan
    BANYAK entry (satu per tipe pintu/jendela) -- beda dari dinding yang
    cuma satu. Kode SINTETIS SENGAJA memakai prefiks aman `KUSEN-AUTO-`
    (BUKAN kode asli dari gambar, mis. "P1") krn kode tipe kusen sering
    bentrok dgn prefiks taksonomi lain (P1 = pondasi_telapak)."""
    all_texts: list[str] = []
    for sheet in doc.sheets:
        all_texts.extend(item.raw for item in sheet.unclassified)
    suggestions = suggest_kusen_schedule(all_texts, ai_client)
    for suggestion in suggestions:
        safe_tipe = _KODE_SANITIZE_PATTERN.sub("", suggestion.tipe.upper()) or "TIPE"
        kode = f"KUSEN-AUTO-{safe_tipe}"
        if kode in registry:
            continue
        registry[kode] = ElementRegistryEntry(
            kode=kode,
            kategori="kusen",
            status="perlu_review",
            ai_kusen_suggestion=suggestion,
        )


_DINDING_SYNTHETIC_KODE = "DINDING-AUTO-1"


def _apply_dinding_ai_assist(
    doc: TkgDocument,
    registry: dict[str, ElementRegistryEntry],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 lanjutan (2026-07-05) -- slice #3: dinding pasangan bata.
    BEDA dari footplat/zona: dinding TIDAK PUNYA kode per-instance sama
    sekali (audit B0), jadi tidak ada `ElementRegistryEntry` yang bisa
    "dilengkapi" -- konteksnya dikumpulkan DOKUMEN-LUAS (semua sheet, semua
    unclassified text), dan kalau AI-assist menemukan+memvalidasi usulan,
    SATU entry SINTETIS baru (`DINDING-AUTO-1`) ditambahkan ke registry.
    Fast filter keyword (`has_wall_keyword`, gratis) dulu sebelum panggil
    LLM sama sekali -- kalau dokumen tidak pernah menyebut kata kunci
    dinding, tidak ada panggilan API sama sekali."""
    if _DINDING_SYNTHETIC_KODE in registry:
        return
    all_texts: list[str] = []
    for sheet in doc.sheets:
        all_texts.extend(item.raw for item in sheet.unclassified)
    suggestion = suggest_dinding_pasangan(all_texts, ai_client)
    if suggestion is None:
        return
    registry[_DINDING_SYNTHETIC_KODE] = ElementRegistryEntry(
        kode=_DINDING_SYNTHETIC_KODE,
        kategori="dinding",
        status="perlu_review",
        ai_dinding_suggestion=suggestion,
    )


def _apply_zone_ai_assist(
    doc: TkgDocument,
    sheets: list[SheetSummary],
    ai_client: AiAssistClient,
) -> None:
    """Fase X2 slice #2 -- fallback paralel utk sheet yang gagal
    diklasifikasi `zone_classifier.py` (`zone is None`). TIDAK PERNAH
    menimpa `zone` asli -- hanya menempel usulan tambahan."""
    for summary in sheets:
        if summary.zone is not None:
            continue
        source_sheet = doc.sheets[summary.page - 1]
        context_texts = [item.raw for item in source_sheet.unclassified]
        suggestion = suggest_zone(source_sheet.meta.judul, context_texts, ai_client)
        if suggestion is not None:
            summary.zone_ai_suggestion = suggestion


def consolidate_document(
    doc: TkgDocument,
    ai_client: AiAssistClient | None = None,
) -> ConsolidatedExtraction:
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

    # Fase U.3 — hitung berapa sheet BERBEDA yang memuat teks unclassified
    # persis sama (dinormalisasi), dipakai `_is_admin_metadata` utk deteksi
    # kop/footer berulang sebelum tahu semua sheet (harus dihitung dulu).
    text_sheet_counts: dict[str, set[int]] = {}
    for i, sheet in enumerate(doc.sheets):
        for unclassified in sheet.unclassified:
            text_sheet_counts.setdefault(_normalize_text(unclassified.raw), set()).add(i)

    registry: dict[str, ElementRegistryEntry] = {}
    for i, sheet in enumerate(doc.sheets):
        for element in sheet.elements:
            kode = _normalize_kode(element.kode)
            entry = registry.setdefault(kode, ElementRegistryEntry(kode=kode))
            entry.kategori = entry.kategori or kategori_dari_kode(kode)
            _remember_raw_code(entry, element.kode)
            addresses = element.alamat_list or ([element.alamat] if element.alamat else [])
            for alamat in addresses:
                entry.instances.append(ElementInstanceRef(sheet_page=i + 1, alamat=alamat, kode_raw=element.kode))
            if element.alamat_needs_review:
                entry.status = "perlu_review"
                assumptions.append(Assumption(
                    pernyataan=f"Alamat grid untuk elemen '{element.kode}' tidak sepenuhnya yakin di sheet {i + 1}",
                    alasan="Posisi elemen tidak match rapi ke grid manapun di sheet ini",
                    sheet_page=i + 1, dampak="sedang",
                ))

        for table in sheet.tables:
            for record in table.records:
                kode = _normalize_kode(record.kode)
                entry = registry.setdefault(kode, ElementRegistryEntry(kode=kode))
                _remember_raw_code(entry, record.kode)
                entry.kategori = entry.kategori or record.kategori
                if entry.definisi is None and (record.dimensi or record.tulangan or record.mutu_beton):
                    entry.definisi = ElementDefinisi(
                        dimensi=record.dimensi, satuan_dimensi=record.satuan_dimensi,
                        tulangan=record.tulangan, mutu_beton=record.mutu_beton,
                        sumber_halaman=i + 1,
                    )

        for unclassified in sheet.unclassified:
            occurrence = len(text_sheet_counts.get(_normalize_text(unclassified.raw), ()))
            if _is_admin_metadata(unclassified.raw, occurrence):
                continue
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

    # Fase X2 (2026-07-05) -- lapisan AI-assist HANYA jalan kalau caller
    # menyediakan client aktif (mis. `GeminiAiAssistClient.from_env()`).
    # Tanpa client (default `None`), perilaku IDENTIK dgn sebelum X2 -- ini
    # fallback paralel, bukan jalur wajib.
    if ai_client is not None:
        _apply_dimension_ai_assist(doc, registry, ai_client)
        _apply_roof_frame_ai_assist(doc, registry, ai_client)
        _apply_dinding_ai_assist(doc, registry, ai_client)
        _apply_kusen_ai_assist(doc, registry, ai_client)
        _apply_mep_ai_assist(doc, registry, ai_client)
        _apply_zone_ai_assist(doc, sheets, ai_client)

    return ConsolidatedExtraction(
        sheets=sheets,
        grid=canonical_grid,
        element_registry=list(registry.values()),
        assumptions=assumptions,
        building_dimensions=building_dimensions,
    )
