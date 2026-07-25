"""
Golden Anchor PLHUT Kankemenag Surakarta 2024 + review perbaikan sesi PLHUT.

Anchor dihitung MANUAL (bukan dari modul yang diuji):
  Beton kolom : 10 x 0.4 x 0.4 x 4.0 = 6.4 m3 (F-B01)
  Besi kolom  : w16 = (pi/4)x16^2x7850/1e6 = 1.578336 kg/m ;
                12 x 4.0 x 1.578336 = 75.7601 kg (F-D02, tanpa kait/lap)
  Bekisting   : 2 x (0.3+0.4) x 3.5 x 1 = 4.9 m2 (F-C01) — reuse_form TIDAK
                membagi kuantitas (upah pasang/bongkar per pemakaian);
                hanya anotasi + params_used (§Z reuse_form).
  SMKK        : struktur item diverifikasi terhadap RAB nyata PLHUT (bagian
                "SISTEM MANAJEMEN KESELAMATAN KONSTRUKSI"): APD 15/jenis utk
                15 pekerja, P3K 1 set, rambu 3, cone 3, personil OB = 1 x 6.
  MEP lanjut  : route 25 m x 2 = 50 m ; count<=0 -> needs_review.
"""
import math

import pytest
from pydantic import ValidationError

from app.takeoff.mep_advanced import (
    MepAdvancedRequest, MepPointAdvanced, MepRouteAdvanced, takeoff_mep_advanced,
)
from app.takeoff.smkk import SmkkRequest, takeoff_smkk
from app.tkg.models import (
    ElementInstance, RebarSpec, SheetMeta, TkgDocument, TkgSheet, TkgTable, TypeRecord,
)
from app.tkg.params import TakeoffParams
from app.tkg.takeoff import takeoff_tkg


def _doc_kolom(n: int, dimensi: dict, tulangan: list | None = None) -> TkgDocument:
    return TkgDocument(
        prj_id="plhut_test", rev_id="rev1",
        sheets=[TkgSheet(
            sheet_id="L1", jenis="denah", meta=SheetMeta(judul="Denah Lantai 1"),
            elements=[ElementInstance(kode="K1", alamat="A1", n=n)],
            tables=[TkgTable(judul="Daftar Kolom", records=[
                TypeRecord(kode="K1", dimensi=dimensi, mutu_beton="fc 25 MPa",
                           tulangan=tulangan or []),
            ])],
        )],
    )


def test_anchor_plhut_beton_kolom():
    """Volume beton kolom: 10 x 0.4 x 0.4 x 4.0 = 6.4 m3."""
    doc = _doc_kolom(10, {"b": 400, "h": 400, "tinggi": 4000})
    res = takeoff_tkg(doc, TakeoffParams())
    beton = next(i for i in res.items if i.kategori == "kolom" and i.work_type == "beton")
    assert beton.quantity == pytest.approx(6.4)


def test_anchor_plhut_besi_tulangan():
    """Berat 12D16 x 4 m: 12 x 4.0 x 1.578336 = 75.7601 kg (tanpa kait/lap)."""
    doc = _doc_kolom(1, {"b": 400, "h": 400, "tinggi": 4000},
                     [RebarSpec(posisi="tul_utama", raw="12D16")])
    res = takeoff_tkg(doc, TakeoffParams(selimut_beton_m=0.04))
    besi = next(i for i in res.items if i.kategori == "kolom" and i.work_type == "besi")
    w_d16 = (math.pi / 4) * 16 ** 2 * 7850 / 1e6
    assert besi.quantity == pytest.approx(12 * 4.0 * w_d16, abs=0.001)


# ─── reuse_form / usage_factor (§Z) — perbaikan review PLHUT ─────────────────

def test_reuse_form_tidak_membagi_kuantitas_bekisting():
    # 2 x (0.3+0.4) x 3.5 = 4.9 m2 — TETAP 4.9 walau dipakai 2x (upah per pemasangan)
    doc = _doc_kolom(1, {"b": 300, "h": 400, "tinggi": 3500})
    r = takeoff_tkg(doc, TakeoffParams(reuse_form=2))
    bek = next(i for i in r.items if i.work_type == "bekisting")
    assert bek.quantity == pytest.approx(4.9)
    assert bek.usage_factor == 2
    assert "dipakai 2x" in bek.formula
    assert any(p.nama == "reuse_form" for p in r.params_used)
    assert any("pakai ulang 2x" in a for a in r.assumptions)


def test_usage_factor_dari_dimensi_tkg_diperingatkan():
    # Kompat lama: usage_factor di dimensi tetap dibaca TAPI ada warning INV-TKG-05
    doc = _doc_kolom(1, {"b": 300, "h": 400, "tinggi": 3500, "usage_factor": 2})
    r = takeoff_tkg(doc, TakeoffParams())
    bek = next(i for i in r.items if i.work_type == "bekisting")
    assert bek.quantity == pytest.approx(4.9)
    assert bek.usage_factor == 2
    assert any("INV-TKG-05" in w for w in r.warnings)


def test_reuse_form_invalid_ditolak():
    with pytest.raises(ValidationError):
        TakeoffParams(reuse_form=0)


# ─── SMKK — anchor dari struktur RAB PLHUT asli ──────────────────────────────

def _smkk_plhut() -> SmkkRequest:
    return SmkkRequest(duration_months=6, num_workers=15, num_k3_officers=1,
                       rambu_count=3, traffic_cone_count=3)


def test_smkk_apd_per_pekerja_sesuai_rab_plhut():
    r = takeoff_smkk(_smkk_plhut())
    by_work = {i.work: i for i in r.items}
    for apd in ("apd_helm", "apd_sepatu", "apd_rompi", "apd_sarung_tangan"):
        assert by_work[apd].quantity == pytest.approx(15.0)
    assert by_work["pelatihan_k3"].quantity == pytest.approx(15.0)   # org
    assert by_work["peralatan_p3k"].quantity == pytest.approx(1.0)
    assert by_work["rambu_peringatan"].quantity == pytest.approx(3.0)
    assert by_work["traffic_cone"].quantity == pytest.approx(3.0)
    assert by_work["pengendalian_risiko_k3"].quantity == pytest.approx(1.0)
    # rule_id bermakna (komponen SMKK), bukan F-H01 (rumus upah HSP)
    assert by_work["apd_helm"].rule_id == "SMKK-03"
    assert not any(i.rule_id.startswith("F-H") for i in r.items)


def test_smkk_personil_ob_dikali_durasi():
    # Bug lama: quantity=jumlah petugas dgn unit OB. Benar: 1 x 6 bulan = 6 OB.
    r = takeoff_smkk(_smkk_plhut())
    personil = next(i for i in r.items if i.work == "petugas_k3")
    assert personil.quantity == pytest.approx(6.0)
    assert personil.unit == "OB"


def test_smkk_masker_opsional_dan_asumsi_tercatat():
    tanpa = takeoff_smkk(_smkk_plhut())
    assert not any(i.work == "apd_masker" for i in tanpa.items)
    dengan = takeoff_smkk(SmkkRequest(duration_months=6, num_workers=15, include_masker=True))
    masker = next(i for i in dengan.items if i.work == "apd_masker")
    assert masker.quantity == pytest.approx(90.0)                    # 15 x 6
    assert any("Masker" in a for a in dengan.assumptions)
    # konvensi APD 1 unit/pekerja juga tercatat (RULE-BOE)
    assert any("APD" in a for a in tanpa.assumptions)


def test_smkk_input_nonsens_ditolak():
    with pytest.raises(ValidationError):
        SmkkRequest(duration_months=0, num_workers=15)
    with pytest.raises(ValidationError):
        SmkkRequest(duration_months=6, num_workers=0)


# ─── MEP lanjut — validasi & rekap ───────────────────────────────────────────

def test_mep_advanced_route_dan_point():
    r = takeoff_mep_advanced(MepAdvancedRequest(
        points=[MepPointAdvanced(kode="FA1", system="fire_alarm",
                                 jenis="smoke_detector", count=12)],
        routes=[MepRouteAdvanced(kode="HYD1", system="hydrant",
                                 jenis_kabel_pipa="pipa_bs_2_5in", length_m=25, qty=2)],
    ))
    pt = next(i for i in r.items if i.kode == "FA1")
    rt = next(i for i in r.items if i.kode == "HYD1")
    assert pt.quantity == pytest.approx(12.0)
    assert rt.quantity == pytest.approx(50.0)                        # 25 x 2
    assert pt.rule_id == "F-G13" and rt.rule_id == "F-G13"           # bukan F-G14 (cat baja)
    assert r.n_needs_review == 0


def test_mep_advanced_count_invalid_jadi_review():
    r = takeoff_mep_advanced(MepAdvancedRequest(
        points=[MepPointAdvanced(kode="FA2", system="fire_alarm",
                                 jenis="smoke_detector", count=0)],
    ))
    item = next(i for i in r.items if i.kode == "FA2")
    assert item.needs_review is True and item.quantity is None
    assert r.n_needs_review == 1
