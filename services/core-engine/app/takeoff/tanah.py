"""
PAAX Core Engine — Take-off §F Pekerjaan Tanah (brain TXT02 §F, F-F01..F-F07).

Disiplin volume (JANGAN dicampur):
  BANK    = tanah asli/insitu (galian menghasilkan bank).
  GEMBUR  = loose setelah digali; V_gembur = V_bank * f_gembur (>1). Untuk angkut.
  PADAT   = terpasang setelah dipadatkan; material dibutuhkan = V_padat * f_susut.

Rantai footplat: galian (bank) -> urugan kembali (bank) = gali - struktur
tertanam -> buangan (gembur) = (gali - urugan kembali) * f_gembur -> ritase.

"Tanpa angka palsu": input yang tak ada (mis. volume struktur tertanam) TIDAK
ditebak; item keluar needs_review. Faktor tanah default dicatat sbg assumption.
"""
from __future__ import annotations
import math
from typing import Dict, List

from ..tkg.params import ParamUsed
from .models import ManualTakeoffResult, TakeoffLine, TanahRequest


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


class _Ctx:
    def __init__(self) -> None:
        self.items: List[TakeoffLine] = []
        self.assumptions: List[str] = []
        self.warnings: List[str] = []
        self.params_used: Dict[str, ParamUsed] = {}

    def pakai(self, nama: str, nilai, catatan: str) -> None:
        if nama not in self.params_used:
            self.params_used[nama] = ParamUsed(nama=nama, nilai=nilai, catatan=catatan)


def takeoff_tanah(req: TanahRequest) -> ManualTakeoffResult:
    ctx = _Ctx()
    p = req.params

    # ── F-F01 galian footplat + F-F03 urugan kembali + F-F07 buangan ──────────
    for fp in req.footplats:
        b_eff = fp.b_ft + 2 * p.w_kerja
        l_eff = fp.l_ft + 2 * p.w_kerja
        v_gali = b_eff * l_eff * fp.d_gali * fp.n
        ctx.pakai("w_kerja", p.w_kerja, "ruang kerja galian tiap sisi (m)")
        ctx.assumptions.append(
            f"{fp.kode}: galian pakai ruang kerja w_kerja={p.w_kerja:g} m tiap sisi (F-F01)")
        ctx.items.append(TakeoffLine(
            kode=fp.kode, work="galian_footplat", quantity=_r4(v_gali), unit="m3 (bank)",
            formula="(b_ft + 2*w_kerja) x (l_ft + 2*w_kerja) x d_gali x n",
            detail=f"({fp.b_ft:g}+2x{p.w_kerja:g}) x ({fp.l_ft:g}+2x{p.w_kerja:g}) x "
                   f"{fp.d_gali:g} x {fp.n} = {_r4(v_gali):g} m3",
            rule_id="F-F01",
        ))

        if fp.v_struktur_tertanam_per_lubang is None:
            ctx.items.append(TakeoffLine(
                kode=fp.kode, work="urugan_kembali", unit="m3 (bank)",
                formula="V_gali_bank - V_struktur_tertanam", detail="-",
                needs_review=True,
                review_reason="v_struktur_tertanam_per_lubang tidak disetor — urugan "
                              "kembali & buangan tidak bisa dihitung tanpa volume struktur "
                              "terpendam (F-F03); jangan ditebak",
                rule_id="F-F03",
            ))
            continue

        v_struktur = fp.v_struktur_tertanam_per_lubang * fp.n
        v_uk = v_gali - v_struktur
        if v_uk < 0:
            ctx.warnings.append(
                f"{fp.kode}: V_struktur ({_r4(v_struktur):g}) > V_gali ({_r4(v_gali):g}) — "
                f"periksa dimensi (F-K07: V_uk tidak boleh negatif)")
            v_uk = 0.0
        ctx.items.append(TakeoffLine(
            kode=fp.kode, work="urugan_kembali", quantity=_r4(v_uk), unit="m3 (bank)",
            formula="V_gali_bank - V_struktur_tertanam",
            detail=f"{_r4(v_gali):g} - {_r4(v_struktur):g} (= {fp.v_struktur_tertanam_per_lubang:g} x "
                   f"{fp.n}) = {_r4(v_uk):g} m3",
            rule_id="F-F03",
        ))

        # F-F07: buangan = sisa bank (= struktur terpendam) dikonversi ke gembur
        v_buang_bank = v_gali - v_uk
        v_buang_gembur = v_buang_bank * p.f_gembur
        ctx.pakai("f_gembur", p.f_gembur, "faktor bank->gembur untuk angkut buangan")
        ctx.assumptions.append(
            f"{fp.kode}: buangan pakai f_gembur={p.f_gembur:g} (bank->gembur, F-F07)")
        ritase = math.ceil(v_buang_gembur / p.kap_truk - 1e-9) if v_buang_gembur > 0 else 0
        ctx.pakai("kap_truk", p.kap_truk, "kapasitas bak truk (m3 gembur)")
        ctx.items.append(TakeoffLine(
            kode=fp.kode, work="buangan_tanah", quantity=_r4(v_buang_gembur), unit="m3 (gembur)",
            formula="(V_gali_bank - V_uk) x f_gembur",
            detail=f"({_r4(v_gali):g} - {_r4(v_uk):g}) x {p.f_gembur:g} = {_r4(v_buang_gembur):g} m3 "
                   f"gembur; ritase = ceil({_r4(v_buang_gembur):g}/{p.kap_truk:g}) = {ritase}",
            rule_id="F-F07",
        ))

    # ── F-F02 galian menerus ──────────────────────────────────────────────────
    for gm in req.galian_menerus:
        b_atas = gm.b_atas if gm.b_atas is not None else gm.b_bawah
        a_penampang = 0.5 * (b_atas + gm.b_bawah) * gm.d_gali   # trapesium (rata-rata lebar)
        v = a_penampang * gm.l_parit
        bentuk = "tegak" if gm.b_atas is None or gm.b_atas == gm.b_bawah else "trapesium"
        ctx.items.append(TakeoffLine(
            kode=gm.kode, work="galian_menerus", quantity=_r4(v), unit="m3 (bank)",
            formula="A_penampang x L ; A_penampang = 0.5*(b_atas + b_bawah)*d_gali",
            detail=f"A=0.5x({b_atas:g}+{gm.b_bawah:g})x{gm.d_gali:g}={_r4(a_penampang):g} m2 "
                   f"({bentuk}); V={_r4(a_penampang):g}x{gm.l_parit:g}={_r4(v):g} m3",
            rule_id="F-F02",
        ))

    # ── F-F04/F-F05 urugan pasir/sirtu/tanah (padat) ──────────────────────────
    for u in req.urugan:
        v_padat = u.a * u.t_lapis
        rule = "F-F04" if u.jenis == "pasir" else "F-F05"
        if u.material_sudah_padat:
            material = v_padat
            catatan_mat = "koef AHSP sudah termasuk padat -> material = V_padat (tak dikali f_susut)"
        else:
            material = v_padat * p.f_susut
            ctx.pakai("f_susut", p.f_susut, "faktor padat->bank untuk kebutuhan material urugan")
            catatan_mat = f"kebutuhan material (lepas) = V_padat x f_susut({p.f_susut:g}) = {_r4(material):g} m3"
        ctx.assumptions.append(f"{u.kode}: urugan {u.jenis} — {catatan_mat} (jangan dobel faktor padat, {rule})")
        ctx.items.append(TakeoffLine(
            kode=u.kode, work=f"urugan_{u.jenis}", quantity=_r4(v_padat), unit="m3 (padat)",
            formula="A x t_lapis  (kuantitas kerja = volume padat terpasang)",
            detail=f"{u.a:g} x {u.t_lapis:g} = {_r4(v_padat):g} m3 padat; {catatan_mat}",
            rule_id=rule,
        ))

    n_review = sum(1 for i in ctx.items if i.needs_review)
    return ManualTakeoffResult(
        domain="tanah", items=ctx.items,
        assumptions=sorted(set(ctx.assumptions)), warnings=ctx.warnings,
        params_used=list(ctx.params_used.values()), n_needs_review=n_review,
    )
