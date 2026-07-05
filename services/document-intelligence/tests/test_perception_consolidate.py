"""Fase E (rencana besar 2026-07-05) — test `consolidate.consolidate_document`.

Fixture sintetis (§0.1) membangun `TkgDocument` LANGSUNG (bukan lewat PDF)
supaya cepat menguji logika konsolidasi murni; smoke PLHUT (skipif) menguji
sanity terhadap dokumen 15-halaman nyata.
"""
from __future__ import annotations

import os

import fitz
import pytest

from app.perception.assemble import assemble_document_from_pdf_bytes
from app.perception.consolidate import consolidate_document
from app.perception.tkg.models import (
    ElementInstance,
    Grid,
    GridAxis,
    GridTotal,
    RebarSpec,
    SheetMeta,
    TkgDocument,
    TkgSheet,
    TkgTable,
    TypeRecord,
    Unclassified,
)


def _doc(sheets: list[TkgSheet]) -> TkgDocument:
    return TkgDocument(prj_id="TEST-E", sheets=sheets)


def test_canonical_grid_picks_most_complete():
    sheet_partial = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0)]),
    )
    sheet_full = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH Y"),
        grid=Grid(
            sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)],
            sumbu_y=[GridAxis(label="P", posisi_mm=0.0), GridAxis(label="Q", posisi_mm=4000.0)],
        ),
    )
    result = consolidate_document(_doc([sheet_partial, sheet_full]))
    assert result.grid is not None
    assert {a.label for a in result.grid.sumbu_x} == {"1", "2"}
    assert {a.label for a in result.grid.sumbu_y} == {"P", "Q"}


def test_grid_conflict_flagged_not_overwritten():
    canonical = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)]),
    )
    conflicting = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH Y"),
        grid=Grid(sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=9999.0)]),
    )
    result = consolidate_document(_doc([canonical, conflicting]))
    assert result.grid is not None
    assert next(a.posisi_mm for a in result.grid.sumbu_x if a.label == "2") == 3000.0
    conflict_msgs = [a for a in result.assumptions if a.dampak == "tinggi"]
    assert len(conflict_msgs) == 1
    assert "2" in conflict_msgs[0].pernyataan


def test_grid_conflict_uses_relative_offset_not_absolute_origin():
    """Fase U (2026-07-13): reproduksi bug nyata screenshot `G:\\gambar
    contoh` -- tiap halaman PDF merekonstruksi grid dgn origin sendiri
    (pola sama V-03 core-engine Fase M-2), jadi axis subset yg SAH (anchor
    per-halaman independen) TIDAK BOLEH ditandai konflik hanya krn posisi
    absolut beda, selama jarak RELATIF antar as yg sama-sama muncul cocok."""
    canonical = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[
            GridAxis(label="A", posisi_mm=0.0),
            GridAxis(label="B", posisi_mm=3000.0),
            GridAxis(label="C", posisi_mm=6500.0),
        ]),
    )
    # Sheet detail hanya menggambar B-C, direkonstruksi dgn origin sendiri
    # (B=0) -- jarak B->C tetap 3500mm, SAMA dgn canonical (6500-3000=3500).
    subset_independent_origin = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH Y"),
        grid=Grid(sumbu_x=[
            GridAxis(label="B", posisi_mm=0.0),
            GridAxis(label="C", posisi_mm=3500.0),
        ]),
    )
    result = consolidate_document(_doc([canonical, subset_independent_origin]))
    conflict_msgs = [a for a in result.assumptions if a.dampak == "tinggi"]
    assert conflict_msgs == []


def test_grid_conflict_repeated_across_many_sheets_collapses_to_one_assumption():
    """Fase U (2026-07-13): reproduksi persis pola screenshot -- axis '4'
    konflik nyata di 9 sheet berbeda menghasilkan SATU Assumption ringkas
    (menyebut semua sheet), BUKAN 9 baris nyaris identik."""
    canonical = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(sumbu_x=[
            GridAxis(label="3", posisi_mm=0.0),
            GridAxis(label="4", posisi_mm=3000.0),
        ]),
    )
    conflicting_sheets = [
        TkgSheet(
            sheet_id=f"S{i}", jenis="denah", meta=SheetMeta(judul=f"DETAIL {i}"),
            grid=Grid(sumbu_x=[
                GridAxis(label="3", posisi_mm=0.0),
                GridAxis(label="4", posisi_mm=13000.0),  # rel beda jauh dari 3000
            ]),
        )
        for i in range(2, 11)  # 9 sheet konflik
    ]
    result = consolidate_document(_doc([canonical, *conflicting_sheets]))
    conflict_msgs = [a for a in result.assumptions if a.dampak == "tinggi"]
    assert len(conflict_msgs) == 1
    assert "9 sheet" in conflict_msgs[0].pernyataan
    for i in range(2, 11):
        assert str(i) in conflict_msgs[0].pernyataan


def test_unclassified_admin_keyword_text_filtered_from_assumptions():
    """Fase U.3 (2026-07-13): teks kop administratif generik (bukan konten
    teknis) tidak boleh jadi 'perlu dicek' -- bukti nyata screenshot:
    'KEMENTRIAN AGAMA RI', 'DIREKTORAT JENDERAL', 'TAHUN ANGGARAN 2024'."""
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        unclassified=[
            Unclassified(raw="KEMENTERIAN AGAMA RI", alasan="tidak cocok grammar"),
            Unclassified(raw="DIREKTORAT JENDERAL", alasan="tidak cocok grammar"),
            Unclassified(raw="TAHUN ANGGARAN 2024", alasan="tidak cocok grammar"),
            Unclassified(raw="Catatan teknis unik halaman ini", alasan="tidak cocok grammar"),
        ],
    )
    result = consolidate_document(_doc([sheet]))
    pernyataan_all = " | ".join(a.pernyataan for a in result.assumptions)
    assert "KEMENTERIAN AGAMA RI" not in pernyataan_all
    assert "DIREKTORAT JENDERAL" not in pernyataan_all
    assert "TAHUN ANGGARAN 2024" not in pernyataan_all
    assert "Catatan teknis unik halaman ini" in pernyataan_all


def test_unclassified_text_repeated_many_sheets_filtered_as_header_footer():
    """Fase U.3: teks IDENTIK yang berulang di banyak sheet (kop/footer non-
    keyword, mis. nama proyek generik) difilter via heuristik frekuensi,
    walau tidak match keyword admin eksplisit."""
    sheets = [
        TkgSheet(
            sheet_id=f"S{i}", jenis="denah", meta=SheetMeta(judul="DENAH X"),
            unclassified=[
                Unclassified(raw="Gedung Serbaguna Kabupaten Contoh", alasan="tidak cocok grammar"),
                Unclassified(raw=f"Catatan unik sheet {i}", alasan="tidak cocok grammar"),
            ],
        )
        for i in range(1, 5)  # 4 sheet -> >= _ADMIN_REPEAT_MIN_SHEETS (3)
    ]
    result = consolidate_document(_doc(sheets))
    pernyataan_all = " | ".join(a.pernyataan for a in result.assumptions)
    assert "Gedung Serbaguna Kabupaten Contoh" not in pernyataan_all
    for i in range(1, 5):
        assert f"Catatan unik sheet {i}" in pernyataan_all


def test_element_registry_merges_instances_across_sheets():
    sheet1 = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.1"),
        elements=[ElementInstance(kode="K1", alamat="A1, B1", alamat_list=["A1", "B1"], n=2, count_label=2)],
    )
    sheet2 = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.2"),
        elements=[ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1)],
    )
    result = consolidate_document(_doc([sheet1, sheet2]))
    entry = next(e for e in result.element_registry if e.kode == "K1")
    assert len(entry.instances) == 3
    assert {(i.sheet_page, i.alamat) for i in entry.instances} == {(1, "A1"), (1, "B1"), (2, "A1")}


def test_element_registry_normalizes_code_variants_but_keeps_raw_codes_for_audit():
    sheets = [
        TkgSheet(
            sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.1"),
            elements=[ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1)],
        ),
        TkgSheet(
            sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.2"),
            elements=[ElementInstance(kode="K-1", alamat="B1", alamat_list=["B1"], n=1, count_label=1)],
        ),
        TkgSheet(
            sheet_id="S3", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.3"),
            elements=[ElementInstance(kode="K 1", alamat="C1", alamat_list=["C1"], n=1, count_label=1)],
        ),
        TkgSheet(
            sheet_id="S4", jenis="tabel", meta=SheetMeta(judul="TABEL KOLOM"),
            elements=[ElementInstance(kode="KOLOM K1", alamat="D1", alamat_list=["D1"], n=1, count_label=1)],
            tables=[TkgTable(judul="tabel kolom", records=[
                TypeRecord(kode="KOLOM K1", kategori="kolom", dimensi={"b": 300.0, "h": 400.0}),
            ])],
        ),
    ]

    result = consolidate_document(_doc(sheets))

    assert [entry.kode for entry in result.element_registry] == ["K1"]
    entry = result.element_registry[0]
    assert entry.kode_asli == ["K1", "K-1", "K 1", "KOLOM K1"]
    assert [(instance.sheet_page, instance.alamat, instance.kode_raw) for instance in entry.instances] == [
        (1, "A1", "K1"),
        (2, "B1", "K-1"),
        (3, "C1", "K 1"),
        (4, "D1", "KOLOM K1"),
    ]
    assert entry.definisi is not None
    assert entry.definisi.dimensi == {"b": 300.0, "h": 400.0}


def test_element_registry_normalization_does_not_collapse_distinct_codes():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM"),
        elements=[
            ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1),
            ElementInstance(kode="K11", alamat="A2", alamat_list=["A2"], n=1, count_label=1),
            ElementInstance(kode="K1A", alamat="A3", alamat_list=["A3"], n=1, count_label=1),
        ],
    )

    result = consolidate_document(_doc([sheet]))

    assert [entry.kode for entry in result.element_registry] == ["K1", "K11", "K1A"]


def test_element_registry_binds_table_definition():
    sheet = TkgSheet(
        sheet_id="S1", jenis="tabel", meta=SheetMeta(judul="TABEL KOLOM"),
        elements=[ElementInstance(kode="K1", alamat="A1", alamat_list=["A1"], n=1, count_label=1)],
        tables=[TkgTable(judul="tabel kolom", records=[
            TypeRecord(kode="K1", kategori="kolom", dimensi={"b": 400.0, "h": 400.0},
                       tulangan=[RebarSpec(posisi="tul_utama", raw="12D16", jumlah=12, diameter_mm=16)]),
        ])],
    )
    result = consolidate_document(_doc([sheet]))
    entry = next(e for e in result.element_registry if e.kode == "K1")
    assert entry.kategori == "kolom"
    assert entry.definisi is not None
    assert entry.definisi.dimensi == {"b": 400.0, "h": 400.0}
    assert entry.definisi.tulangan[0].jumlah == 12


def test_needs_review_element_marks_registry_status_and_assumption():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        elements=[ElementInstance(
            kode="K9", alamat="dekat Z9 (perlu verifikasi)",
            alamat_list=["dekat Z9 (perlu verifikasi)"], alamat_needs_review=True, n=1, count_label=1,
        )],
    )
    result = consolidate_document(_doc([sheet]))
    entry = next(e for e in result.element_registry if e.kode == "K9")
    assert entry.status == "perlu_review"
    assert any("K9" in a.pernyataan for a in result.assumptions)


def test_unclassified_becomes_assumption_with_page_reference():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        unclassified=[Unclassified(raw="CATATAN ANEH", alasan="tidak cocok grammar apa pun")],
    )
    result = consolidate_document(_doc([sheet]))
    assumption = next(a for a in result.assumptions if "CATATAN ANEH" in a.pernyataan)
    assert assumption.sheet_page == 1
    assert assumption.dampak == "rendah"


def test_building_dimensions_from_canonical_grid_total():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"),
        grid=Grid(
            sumbu_x=[GridAxis(label="1", posisi_mm=0.0), GridAxis(label="2", posisi_mm=3000.0)],
            total_x=GridTotal(dari="1", ke="2", nilai=3000.0),
            total_y=GridTotal(dari="P", ke="Q", nilai=4000.0),
        ),
    )
    result = consolidate_document(_doc([sheet]))
    assert result.building_dimensions.total_x_mm == 3000.0
    assert result.building_dimensions.total_y_mm == 4000.0
    assert result.building_dimensions.sumber == "grid"


def test_no_grid_anywhere_reports_honest_unavailable():
    sheet = TkgSheet(sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH X"))
    result = consolidate_document(_doc([sheet]))
    assert result.grid is None
    assert result.building_dimensions.sumber == "tidak_tersedia"
    assert result.building_dimensions.total_x_mm is None


@pytest.mark.skipif(not os.environ.get("PAAX_PLHUT_PDF"), reason="butuh PDF PLHUT asli (env PAAX_PLHUT_PDF)")
def test_smoke_real_plhut_consolidation_sane():
    with open(os.environ["PAAX_PLHUT_PDF"], "rb") as fh:
        pdf_bytes = fh.read()
    doc, _metrics = assemble_document_from_pdf_bytes(pdf_bytes, prj_id="plhut-consolidate-smoke")
    result = consolidate_document(doc)
    assert len(result.sheets) == 15
    assert result.building_dimensions.total_x_mm == 10000.0
    assert result.building_dimensions.total_y_mm == 20000.0
    pc1 = next(e for e in result.element_registry if e.kode == "PC1")
    assert len(pc1.instances) == 12
    assert pc1.status == "terbaca"


# --- Fase X2 (2026-07-05) — wiring AI-assist ke consolidate_document -------
# Fixture SENGAJA pakai kode/angka BERBEDA dari PLHUT (§0.1 "PLHUT = fixture
# bukan template") -- kode "P9" (bukan P1-P7/PC1-PC3/F1-F2 milik PLHUT) dan
# angka 900/800/450 (bukan 1500/1300 milik PLHUT) untuk membuktikan modul ini
# generalisasi, bukan menghafal kasus PLHUT.

class _FakeAiAssistClient:
    def __init__(self, response: dict | None):
        self.response = response
        self.calls: list[dict] = []

    def generate_json(self, *, system_prompt, user_prompt, response_schema):
        self.calls.append({"system_prompt": system_prompt, "user_prompt": user_prompt})
        return self.response


def test_ai_assist_dimension_suggestion_attached_when_rule_based_gap_and_client_active():
    """Elemen pondasi_telapak (P9) TANPA dimensi dari rule-based (tidak ada
    tabel kode-dimensi yang match), tapi ADA sheet detail_tabel yang memuat
    kode+angka lepas -- pola PERSIS temuan X1/X1B (PLHUT halaman 49), dgn
    kode/angka BERBEDA. AI-assist harus menempel usulan TANPA mengubah
    status/dimensi asli entry (tetap kosong, bukan 'dihitung')."""
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH PONDASI", zone="substruktur"),
        elements=[ElementInstance(kode="P9", alamat="A1")],
    )
    detail = TkgSheet(
        sheet_id="S2", jenis="detail", meta=SheetMeta(judul="DETAIL PONDASI", zone="detail_tabel"),
        unclassified=[
            Unclassified(raw="P 9", alasan="tidak cocok grammar tabel"),
            Unclassified(raw="900", alasan="tidak cocok grammar tabel"),
            Unclassified(raw="800", alasan="tidak cocok grammar tabel"),
            Unclassified(raw="kedalaman 450", alasan="tidak cocok grammar tabel"),
        ],
    )
    fake = _FakeAiAssistClient({
        "b_mm": 900, "l_mm": 800, "d_gali_mm": 450,
        "confidence": 0.8,
        "reasoning": "900/800 dimensi dasar, 450 kedalaman galian P9.",
        "source_texts": ["900", "800", "kedalaman 450"],
    })

    result = consolidate_document(_doc([denah, detail]), ai_client=fake)

    entry = next(e for e in result.element_registry if e.kode == "P9")
    assert entry.kategori == "pondasi_telapak"
    # Rule-based TETAP gagal (Aturan Emas: AI tidak menulis angka final) --
    # dimensi asli tetap kosong, hanya usulan yang ditempel.
    assert not (entry.definisi.dimensi if entry.definisi else {})
    assert entry.ai_dimension_suggestion is not None
    assert entry.ai_dimension_suggestion.b_mm == 900
    assert entry.ai_dimension_suggestion.l_mm == 800
    assert entry.ai_dimension_suggestion.d_gali_mm == 450
    assert len(fake.calls) >= 1


def test_ai_assist_not_invoked_when_no_client_provided():
    """Tanpa `ai_client` (default None), perilaku IDENTIK dgn sebelum Fase
    X2 -- tidak ada `ai_dimension_suggestion` sama sekali."""
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH PONDASI", zone="substruktur"),
        elements=[ElementInstance(kode="P9", alamat="A1")],
    )
    detail = TkgSheet(
        sheet_id="S2", jenis="detail", meta=SheetMeta(judul="DETAIL PONDASI", zone="detail_tabel"),
        unclassified=[Unclassified(raw="P 9", alasan="x"), Unclassified(raw="900", alasan="x")],
    )
    result = consolidate_document(_doc([denah, detail]))
    entry = next(e for e in result.element_registry if e.kode == "P9")
    assert entry.ai_dimension_suggestion is None


def test_ai_assist_not_invoked_when_rule_based_dimension_already_present():
    """Fast-path rule-based tetap diutamakan: kalau tabel kode-dimensi SUDAH
    mengisi `definisi.dimensi`, AI-assist tidak boleh dipanggil sama sekali
    (tidak perlu, dan mencegah biaya panggilan LLM yang tidak berguna)."""
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH PONDASI", zone="substruktur"),
        elements=[ElementInstance(kode="P9", alamat="A1")],
        tables=[TkgTable(judul="TABEL PONDASI", records=[
            TypeRecord(kode="P9", kategori="pondasi_telapak", dimensi={"b": 900.0, "l": 800.0}),
        ])],
    )
    detail = TkgSheet(
        sheet_id="S2", jenis="detail", meta=SheetMeta(judul="DETAIL PONDASI", zone="detail_tabel"),
        unclassified=[Unclassified(raw="P 9", alasan="x"), Unclassified(raw="900", alasan="x")],
    )
    fake = _FakeAiAssistClient({
        "b_mm": 900, "l_mm": 800, "d_gali_mm": None,
        "confidence": 0.9, "reasoning": "tidak seharusnya dipanggil",
        "source_texts": ["900"],
    })
    result = consolidate_document(_doc([denah, detail]), ai_client=fake)
    entry = next(e for e in result.element_registry if e.kode == "P9")
    assert entry.ai_dimension_suggestion is None
    assert fake.calls == []


# --- Fase X2 lanjutan (2026-07-05) -- wiring AI-assist dinding pasangan bata
# Beda dari footplat: dinding TIDAK PUNYA kode per-instance sama sekali,
# jadi konteksnya DOKUMEN-LUAS (semua sheet), bukan per-entry.

def test_ai_assist_dinding_creates_synthetic_entry_when_wall_note_found():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH LANTAI 1", zone="struktur_lantai_1"),
        unclassified=[
            Unclassified(raw="PANJANG DINDING KELILING 45.6 M", alasan="tidak cocok grammar"),
            Unclassified(raw="TINGGI DINDING 3.0 M", alasan="tidak cocok grammar"),
            Unclassified(raw="PASANGAN BATA 1/2 BATU", alasan="tidak cocok grammar"),
        ],
    )
    fake = _FakeAiAssistClient({
        "l_dinding_m": 45.6, "h_dinding_m": 3.0, "bukaan_total_m2": None,
        "plester_sisi": 2, "acian": True, "cat": True,
        "confidence": 0.75,
        "reasoning": "panjang & tinggi dinding disebut eksplisit",
        "source_texts": ["PANJANG DINDING KELILING 45.6 M", "TINGGI DINDING 3.0 M"],
    })
    result = consolidate_document(_doc([sheet]), ai_client=fake)

    entry = next((e for e in result.element_registry if e.kategori == "dinding"), None)
    assert entry is not None
    assert entry.ai_dinding_suggestion is not None
    assert entry.ai_dinding_suggestion.l_dinding_m == 45.6
    assert entry.ai_dinding_suggestion.h_dinding_m == 3.0
    assert entry.status == "perlu_review"  # tetap perlu_review, bukan "terbaca" -- belum dihitung engine


def test_ai_assist_dinding_not_invoked_when_no_wall_keyword_anywhere():
    """Fast filter: dokumen sama sekali tidak menyebut kata kunci dinding
    -> tidak ada entry sintetis dibuat, TIDAK ADA panggilan client."""
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH KOLOM LT.1"),
        elements=[ElementInstance(kode="K1", alamat="A1")],
    )
    fake = _FakeAiAssistClient({
        "l_dinding_m": 10.0, "h_dinding_m": 3.0, "confidence": 1.0,
        "reasoning": "tidak seharusnya dipanggil", "source_texts": ["x"],
    })
    result = consolidate_document(_doc([sheet]), ai_client=fake)
    assert not any(e.kategori == "dinding" for e in result.element_registry)


def test_ai_assist_dinding_not_invoked_without_client():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH LANTAI 1"),
        unclassified=[Unclassified(raw="PANJANG DINDING 45.6 M", alasan="x")],
    )
    result = consolidate_document(_doc([sheet]))
    assert not any(e.kategori == "dinding" for e in result.element_registry)


def test_ai_assist_roof_frame_suggestion_attached_when_rule_based_gap_and_client_active():
    """gording SUDAH dikenali taksonomi (kode GD1) & masuk registry via
    jalur normal (pola sama kolom/balok) -- gap murni bridging, pola PERSIS
    X1 footplat. Fixture kode "GD9" & angka BERBEDA dari contoh manapun di
    codebase (§0.1)."""
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH ATAP", zone="struktur_atap"),
        elements=[ElementInstance(kode="GD9", alamat="A1")],
    )
    detail = TkgSheet(
        sheet_id="S2", jenis="detail", meta=SheetMeta(judul="DETAIL GORDING", zone="detail_tabel"),
        unclassified=[
            Unclassified(raw="GD 9", alasan="x"),
            Unclassified(raw="L MIRING SISI 7 M", alasan="x"),
            Unclassified(raw="JARAK GORDING 1.5 M", alasan="x"),
            Unclassified(raw="L ARAH GORDING 9 M", alasan="x"),
            Unclassified(raw="2 SISI ATAP", alasan="x"),
        ],
    )
    fake = _FakeAiAssistClient({
        "l_miring_sisi_m": 7.0, "s_gording_m": 1.5, "l_arah_gording_m": 9.0, "n_sisi_atap": 2,
        "confidence": 0.8, "reasoning": "semua dimensi disebut eksplisit",
        "source_texts": ["L MIRING SISI 7 M", "JARAK GORDING 1.5 M", "L ARAH GORDING 9 M", "2 SISI ATAP"],
    })
    result = consolidate_document(_doc([denah, detail]), ai_client=fake)

    entry = next(e for e in result.element_registry if e.kode == "GD9")
    assert entry.kategori == "gording"
    assert entry.ai_roof_frame_suggestion is not None
    assert entry.ai_roof_frame_suggestion.fields["l_miring_sisi_m"] == 7.0


def test_ai_assist_roof_frame_not_invoked_when_rule_based_already_complete():
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH ATAP", zone="struktur_atap"),
        elements=[ElementInstance(kode="TS9", alamat="A1")],
        tables=[TkgTable(judul="TABEL TREKSTANG", records=[
            TypeRecord(kode="TS9", kategori="trekstang", dimensi={
                "panjang_per_batang_m": 3.0, "jumlah": 10.0,
            }),
        ])],
    )
    detail = TkgSheet(
        sheet_id="S2", jenis="detail", meta=SheetMeta(judul="DETAIL TREKSTANG", zone="detail_tabel"),
        unclassified=[Unclassified(raw="TS 9", alasan="x"), Unclassified(raw="PANJANG 3 M", alasan="x")],
    )
    fake = _FakeAiAssistClient({
        "panjang_per_batang_m": 3.0, "jumlah": 10.0,
        "confidence": 0.9, "reasoning": "tidak seharusnya dipanggil", "source_texts": ["PANJANG 3 M"],
    })
    result = consolidate_document(_doc([denah, detail]), ai_client=fake)
    entry = next(e for e in result.element_registry if e.kode == "TS9")
    assert entry.ai_roof_frame_suggestion is None
    assert fake.calls == []


def test_ai_assist_kusen_creates_synthetic_entries_per_type_when_schedule_found():
    """Beda dari dinding (1 entry) -- jadwal kusen bisa hasilkan BEBERAPA
    entry sekaligus, satu per tipe pintu/jendela."""
    sheet = TkgSheet(
        sheet_id="S1", jenis="tabel", meta=SheetMeta(judul="JADWAL PINTU JENDELA"),
        unclassified=[
            Unclassified(raw="JADWAL PINTU JENDELA", alasan="x"),
            Unclassified(raw="P1 0.8X2.1 JUMLAH 6", alasan="x"),
            Unclassified(raw="J1 0.6X1.2 JUMLAH 10", alasan="x"),
        ],
    )
    fake = _FakeAiAssistClient({
        "items": [
            {"tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
             "source_texts": ["P1 0.8X2.1 JUMLAH 6"]},
            {"tipe": "J1", "width_m": 0.6, "height_m": 1.2, "qty": 10,
             "source_texts": ["J1 0.6X1.2 JUMLAH 10"]},
        ],
    })
    result = consolidate_document(_doc([sheet]), ai_client=fake)

    kusen_entries = [e for e in result.element_registry if e.kategori == "kusen"]
    assert len(kusen_entries) == 2
    kodes = {e.kode for e in kusen_entries}
    assert kodes == {"KUSEN-AUTO-P1", "KUSEN-AUTO-J1"}
    for e in kusen_entries:
        assert e.status == "perlu_review"
        assert e.ai_kusen_suggestion is not None


def test_ai_assist_kusen_does_not_collide_with_pondasi_telapak_code_p1():
    """Verifikasi eksplisit anti-tabrakan: elemen pondasi "P1" (nyata, dari
    kode) dan tipe kusen "P1" (dari jadwal teks) HARUS jadi 2 entry
    terpisah dgn kode berbeda -- tidak boleh tertukar/timpa."""
    denah = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH PONDASI"),
        elements=[ElementInstance(kode="P1", alamat="A1")],
    )
    jadwal = TkgSheet(
        sheet_id="S2", jenis="tabel", meta=SheetMeta(judul="JADWAL PINTU"),
        unclassified=[
            Unclassified(raw="JADWAL PINTU", alasan="x"),
            Unclassified(raw="P1 0.8X2.1 JUMLAH 6", alasan="x"),
        ],
    )
    fake = _FakeAiAssistClient({
        "items": [{"tipe": "P1", "width_m": 0.8, "height_m": 2.1, "qty": 6,
                   "source_texts": ["P1 0.8X2.1 JUMLAH 6"]}],
    })
    result = consolidate_document(_doc([denah, jadwal]), ai_client=fake)

    pondasi_entry = next(e for e in result.element_registry if e.kode == "P1")
    kusen_entry = next(e for e in result.element_registry if e.kode == "KUSEN-AUTO-P1")
    assert pondasi_entry.kategori == "pondasi_telapak"
    assert kusen_entry.kategori == "kusen"
    assert pondasi_entry is not kusen_entry


def test_ai_assist_kusen_not_invoked_without_client():
    sheet = TkgSheet(
        sheet_id="S1", jenis="tabel", meta=SheetMeta(judul="JADWAL PINTU"),
        unclassified=[
            Unclassified(raw="JADWAL PINTU", alasan="x"),
            Unclassified(raw="P1 0.8X2.1 JUMLAH 6", alasan="x"),
        ],
    )
    result = consolidate_document(_doc([sheet]))
    assert not any(e.kategori == "kusen" for e in result.element_registry)


def test_ai_assist_mep_creates_synthetic_entries_per_jenis_when_count_note_found():
    """Slice TERAKHIR rangkaian X2 lanjutan -- pola sama kusen (dokumen-luas,
    beberapa entry sekaligus), tapi HANYA dari catatan jumlah eksplisit."""
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH TITIK LISTRIK"),
        unclassified=[
            Unclassified(raw="TOTAL TITIK LAMPU 12", alasan="x"),
            Unclassified(raw="JUMLAH STOP KONTAK 8", alasan="x"),
        ],
    )
    fake = _FakeAiAssistClient({
        "items": [
            {"jenis": "lampu", "count": 12, "source_texts": ["TOTAL TITIK LAMPU 12"]},
            {"jenis": "stop_kontak", "count": 8, "source_texts": ["JUMLAH STOP KONTAK 8"]},
        ],
    })
    result = consolidate_document(_doc([sheet]), ai_client=fake)

    mep_entries = [e for e in result.element_registry if e.kategori == "mep"]
    assert len(mep_entries) == 2
    kodes = {e.kode for e in mep_entries}
    assert kodes == {"MEP-AUTO-LAMPU", "MEP-AUTO-STOPKONTAK"}
    for e in mep_entries:
        assert e.status == "perlu_review"
        assert e.ai_mep_suggestion is not None


def test_ai_assist_mep_not_invoked_without_client():
    sheet = TkgSheet(
        sheet_id="S1", jenis="denah", meta=SheetMeta(judul="DENAH TITIK LISTRIK"),
        unclassified=[Unclassified(raw="TOTAL TITIK LAMPU 12", alasan="x")],
    )
    result = consolidate_document(_doc([sheet]))
    assert not any(e.kategori == "mep" for e in result.element_registry)


def test_ai_assist_zone_suggestion_attached_for_unclassified_sheet_only():
    """Sheet dgn judul yang TIDAK match rule-based apa pun (`zone=None`)
    dapat usulan AI, TANPA menimpa `zone` asli. Sheet lain yang SUDAH
    terklasifikasi rule-based (`zone` terisi) tidak boleh dapat usulan sama
    sekali (fast-path rule-based tetap diutamakan)."""
    unclassified_sheet = TkgSheet(
        sheet_id="S1", jenis="campuran", meta=SheetMeta(judul="JUDUL TIDAK DIKENAL"),
        unclassified=[Unclassified(raw="Peta lokasi kawasan", alasan="tidak match keyword")],
    )
    classified_sheet = TkgSheet(
        sheet_id="S2", jenis="denah", meta=SheetMeta(judul="DENAH PONDASI", zone="substruktur"),
    )
    fake = _FakeAiAssistClient({
        "zone": "situasi", "confidence": 0.65,
        "reasoning": "Judul + 'peta lokasi kawasan' mengindikasikan site plan.",
    })
    result = consolidate_document(_doc([unclassified_sheet, classified_sheet]), ai_client=fake)

    summary_unclassified = next(s for s in result.sheets if s.sheet_id == "S1")
    summary_classified = next(s for s in result.sheets if s.sheet_id == "S2")
    assert summary_unclassified.zone is None  # TIDAK PERNAH ditimpa
    assert summary_unclassified.zone_ai_suggestion is not None
    assert summary_unclassified.zone_ai_suggestion.zone == "situasi"
    assert summary_classified.zone_ai_suggestion is None  # sudah terklasifikasi, tidak perlu usulan
    assert len(fake.calls) == 1  # HANYA dipanggil utk sheet yang unclassified


def test_ai_assist_zone_suggestion_discarded_when_model_returns_foreign_enum():
    """Validasi deterministik tetap berlaku lewat jalur wiring penuh: kalau
    model mengembalikan nilai zona di luar enum tertutup, `consolidate_
    document` tidak menempelkan apa pun (bukan menyimpan nilai asing)."""
    unclassified_sheet = TkgSheet(
        sheet_id="S1", jenis="campuran", meta=SheetMeta(judul="JUDUL ANEH"),
    )
    fake = _FakeAiAssistClient({
        "zone": "kategori_karangan_model", "confidence": 0.99, "reasoning": "mengarang",
    })
    result = consolidate_document(_doc([unclassified_sheet]), ai_client=fake)
    summary = result.sheets[0]
    assert summary.zone is None
    assert summary.zone_ai_suggestion is None
