"""
Golden anchor RAB TOTAL — engine UMUM merakit RAB profesional NYATA (Fase 0a-2).

Sumber kunci jawaban: `rab gedung plhut surakarta ALFA.xlsx` sheet DKH (Daftar
Kuantitas & Harga) — 224 baris item + volume; grand_total profesional =
Rp 1.860.078.607 (PPN 11% per baris). Fixture: tests/fixtures/plhut/dkh_golden.json.

Yang diuji = ENGINE UMUM `compute_rab()` (assembly Σ volume×HSP + PPN) vs RAB
profesional nyata. 79/224 baris punya rincian AHS -> HSP dihitung engine dari
KOEFISIEN (bukan disalin dari ALFA); 145 baris direct/lump-sum (SMKK, APD, dsb.)
dimodelkan pseudo-AHSP harga langsung (overhead 0) — cara sah engine menangani
item lump-sum. Layer HSP-dari-koefisien diuji terpisah di test_plhut_hsp_golden.

PLHUT = kunci jawaban di tests/, BUKAN template sistem (prinsip §0.1 roadmap).
Terverifikasi: engine total Rp 1.860.095.380 vs ALFA Rp 1.860.078.608 = dev +0.0009%.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.rab.models import AHSPItem, Component, ResourcePrice, RABLineInput
from app.rab.rab import compute_rab, compute_hsp

FIX = Path(__file__).parent / "fixtures" / "plhut"


def _load():
    ahs = json.loads((FIX / "ahs_golden.json").read_text(encoding="utf-8"))
    dkh = json.loads((FIX / "dkh_golden.json").read_text(encoding="utf-8"))
    return ahs, dkh


def _build(ahs: dict, dkh: dict):
    """Rakit price_book + ahsp_index + RABLineInput dari fixture (seperti UI/orchestrator)."""
    price_book = {
        r["code"]: ResourcePrice(code=r["code"], name=r["name"], category=r["category"],
                                 unit=r["unit"], price=r["price"])
        for r in ahs["resources"]
    }
    ahsp_index = {
        a["code"]: AHSPItem(
            code=a["code"], name=a["name"], unit=a["unit"], overhead_profit=a["overhead_profit"],
            components=[Component(resource_code=c["resource_code"], category=c["category"],
                                  coefficient=c["coefficient"]) for c in a["components"]],
        )
        for a in ahs["analyses"]
    }
    lines: list[RABLineInput] = []
    for ln in dkh["lines"]:
        code = ln["ahs_code"]
        if not code:
            # pseudo-AHSP direct: 1 komponen coef 1 x harga_satuan, tanpa overhead
            code = f"PLHUT-DIR-{ln['seq']:03d}"
            rk = code + "#R"
            price_book[rk] = ResourcePrice(code=rk, name=(ln["uraian"][:40] or "direct"),
                                           category="bahan", unit=ln["satuan"], price=ln["harga_satuan"])
            ahsp_index[code] = AHSPItem(code=code, name=(ln["uraian"][:60] or "direct"),
                                        unit=ln["satuan"], overhead_profit=0.0,
                                        components=[Component(resource_code=rk, category="bahan", coefficient=1.0)])
        lines.append(RABLineInput(ahsp_code=code, volume=ln["volume"]))
    return price_book, ahsp_index, lines


def test_fixture_dkh_terisi():
    ahs, dkh = _load()
    assert dkh["n_lines"] == 224
    assert dkh["n_mapped_ahs"] == 79
    assert len(dkh["lines"]) == 224


def test_engine_rab_total_reproduksi_rab_profesional():
    """Engine UMUM compute_rab() harus mereproduksi grand_total RAB profesional.

    Toleransi 0.5% (jauh lebih longgar dari realita +0.0009%) untuk menyerap
    pembulatan HSP koefisien vs harga_satuan tertulis. Aturan Emas: engine yang
    menghitung; test hanya membandingkan ke kunci jawaban.
    """
    ahs, dkh = _load()
    price_book, ahsp_index, lines = _build(ahs, dkh)
    res = compute_rab(lines, ahsp_index, price_book, region="Surakarta (fixture)",
                      region_code="surakarta-fixture", ppn_rate=dkh["ppn_rate"])
    grand = dkh["grand_total"]
    assert abs(res.total - grand) <= 0.005 * grand, (
        f"engine total={res.total:,.0f} vs grand_total={grand:,.0f} "
        f"(dev {(res.total-grand)/grand*100:+.4f}%)"
    )
    assert len(res.lines) == 224


def test_subset_79_ahs_via_koefisien_mendekati_alfa():
    """Subtotal 79 baris ber-AHS (HSP dari koefisien engine) ≈ subtotal ALFA (≤0.5%)."""
    ahs, dkh = _load()
    price_book, ahsp_index, _ = _build(ahs, dkh)
    eng = alfa = 0.0
    for ln in dkh["lines"]:
        if ln["ahs_code"]:
            hsp = compute_hsp(ahsp_index[ln["ahs_code"]], price_book).hsp
            eng += ln["volume"] * hsp
            alfa += ln["volume"] * ln["harga_satuan"]
    assert alfa > 0 and abs(eng - alfa) <= 0.005 * alfa
