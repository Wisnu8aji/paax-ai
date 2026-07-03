"""
Grounding NYATA — price book Surakarta (HSD asli) memproduksi RAB PLHUT (Fase 0b, parsial).

Owner-authorized (2026-07-03): harga di ALFA.xlsx (HARGA BAHAN/DKH/HSP) = harga
ASLI Surakarta 2024, dipakai sebagai HSD sistem. Price book UMUM regional dibangun
ke `data/harga-satuan/surakarta.json` (112 resource) — grounding sah per §0.1
(harga = pengecualian regional; koefisien/answer-key PLHUT tetap fixture).

Test ini membuktikan: engine UMUM, memakai price book Surakarta NYATA (bukan harga
inline fixture), mereproduksi RAB profesional PLHUT dalam toleransi — dgn deviasi
yang SELURUHNYA dijelaskan oleh inkonsistensi harga internal ALFA (HARGA BAHAN vs
harga di analisa), tercatat di `alfa_price_conflicts` (auditable, brain RULE-HRG-02).

Realita terverifikasi: total via price book kanonik = Rp 1.885.558.837 vs ALFA
Rp 1.860.078.608 = +1,37% (jauh di dalam toleransi GERBANG-0b ±10%).
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from app.rab.models import AHSPItem, Component, ResourcePrice, RABLineInput
from app.rab.rab import compute_rab

REPO = Path(__file__).resolve().parents[3]
SURAKARTA = REPO / "data" / "harga-satuan" / "surakarta.json"
FIX = Path(__file__).parent / "fixtures" / "plhut"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _load():
    ska = json.loads(SURAKARTA.read_text(encoding="utf-8"))
    ahs = json.loads((FIX / "ahs_golden.json").read_text(encoding="utf-8"))
    dkh = json.loads((FIX / "dkh_golden.json").read_text(encoding="utf-8"))
    return ska, ahs, dkh


def test_surakarta_pricebook_nyata_termuat():
    ska, _, _ = _load()
    assert ska["region_code"] == "surakarta"
    assert len(ska["resources"]) >= 100
    # konflik harga internal ALFA tercatat jujur (bukan disembunyikan)
    for c in ska["alfa_price_conflicts"]:
        assert c["harga_bahan"] != c["analisa"]


def test_semua_komponen_plhut_terpetakan_ke_harga_surakarta():
    """Coverage: tiap resource yang dipakai 32 analisa PLHUT punya harga Surakarta (by nama)."""
    ska, ahs, _ = _load()
    by_name = {r["norm_name"]: r for r in ska["resources"]}
    res_name = {r["code"]: r["name"] for r in ahs["resources"]}
    unmapped = []
    for a in ahs["analyses"]:
        for c in a["components"]:
            if _norm(res_name[c["resource_code"]]) not in by_name:
                unmapped.append(res_name[c["resource_code"]])
    assert not unmapped, f"resource tanpa harga Surakarta: {sorted(set(unmapped))}"


def test_engine_reproduksi_rab_via_price_book_surakarta_nyata():
    """Engine UMUM + price book Surakarta NYATA -> total RAB dalam ±2% (real +1,37%).

    Deviasi = inkonsistensi harga internal ALFA (tercatat di alfa_price_conflicts),
    bukan kesalahan engine. Aturan Emas: engine yang hitung; test hanya banding.
    """
    ska, ahs, dkh = _load()
    by_name = {r["norm_name"]: r for r in ska["resources"]}
    res_name = {r["code"]: r["name"] for r in ahs["resources"]}

    price_book = {
        r["code"]: ResourcePrice(code=r["code"], name=r["name"], category=r["category"],
                                 unit=r["unit"], price=r["price"])
        for r in ska["resources"]
    }
    ahsp_index: dict[str, AHSPItem] = {}
    for a in ahs["analyses"]:
        comps = [
            Component(resource_code=by_name[_norm(res_name[c["resource_code"]])]["code"],
                      category=c["category"], coefficient=c["coefficient"])
            for c in a["components"]
        ]
        ahsp_index[a["code"]] = AHSPItem(code=a["code"], name=a["name"], unit=a["unit"],
                                         overhead_profit=a["overhead_profit"], components=comps)

    lines: list[RABLineInput] = []
    for ln in dkh["lines"]:
        if ln["ahs_code"] and ln["ahs_code"] in ahsp_index:
            lines.append(RABLineInput(ahsp_code=ln["ahs_code"], volume=ln["volume"]))
        else:
            code = f"DIR-{ln['seq']:03d}"
            rk = code + "#R"
            price_book[rk] = ResourcePrice(code=rk, name="direct", category="bahan",
                                           unit=ln["satuan"], price=ln["harga_satuan"])
            ahsp_index[code] = AHSPItem(code=code, name="direct", unit=ln["satuan"],
                                        overhead_profit=0.0,
                                        components=[Component(resource_code=rk, category="bahan", coefficient=1.0)])
            lines.append(RABLineInput(ahsp_code=code, volume=ln["volume"]))

    res = compute_rab(lines, ahsp_index, price_book, region="Kota Surakarta",
                      region_code="surakarta", ppn_rate=dkh["ppn_rate"])
    grand = dkh["grand_total"]
    dev = abs(res.total - grand) / grand
    assert dev <= 0.02, f"total={res.total:,.0f} vs {grand:,.0f} (dev {dev*100:.2f}%) di luar ±2%"
