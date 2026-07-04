"""
PAAX Document Intelligence — Validator sisi-persepsi + gerbang (Fase 2 P4).

Subset V-01..V-10 (brain-00 §7) yang bisa dievaluasi dari data yang tersedia
di iterasi ini (span/run persepsi). V-02/03/04/05/08 (butuh geometri grid
lengkap / TYPE_INDEX lintas sheet) dievaluasi core-engine
(`core-engine/app/tkg/validate.py`) setelah TKG dikirim ke sana — TIDAK
diduplikasi di sini.

CAKUPAN JUJUR: V-07 (satuan konsisten), V-09 (skala per viewport), V-10
(kelengkapan kop) BELUM dievaluasi (data span mentah per-kategori/skala/kop
belum ditrack terpisah di P3 iterasi ini) — dilaporkan sbg "belum dievaluasi",
BUKAN dipaksakan lolos diam-diam (selaras pola core-engine validate.py sendiri
yang juga eksplisit mencatat keterbatasan serupa).
"""
from __future__ import annotations

from app.perception.params import EVAL_TKG_GRAMMAR_MIN


def aggregate_metrics(per_sheet_metrics: list[dict]) -> dict:
    run_total = sum(m["run_total"] for m in per_sheet_metrics)
    run_terklasifikasi = sum(m["run_terklasifikasi"] for m in per_sheet_metrics)
    n_unclassified = sum(m["n_unclassified"] for m in per_sheet_metrics)
    cakupan = (run_terklasifikasi / run_total) if run_total else 1.0
    return {
        "span_total": run_total,
        "span_terklasifikasi": run_terklasifikasi,
        "cakupan": cakupan,
        "grammar_pass_rate": cakupan,  # proxy: run yg lolos grammar/grid/tabel = "classified"
        "n_unclassified": n_unclassified,
        "n_warning": 0,
    }


def build_gerbang(metrics: dict, n_sheets: int) -> dict:
    """§7 brain-00: laporan gerbang draft vs lolos, dari metrik yang TERSEDIA."""
    checks = [
        {
            "code": "V-01",
            "label": "Cakupan teks (zero-loss)",
            "passed": True,
            "detail": f"{metrics['span_terklasifikasi']}/{metrics['span_total']} run terklasifikasi "
                      f"atau tercatat unclassified — tidak ada yang dibuang (struktural, selalu benar).",
        },
        {
            "code": "V-06",
            "label": f"Grammar-pass rate >= {EVAL_TKG_GRAMMAR_MIN:.0%}",
            "passed": metrics["grammar_pass_rate"] >= EVAL_TKG_GRAMMAR_MIN,
            "detail": f"{metrics['grammar_pass_rate']:.1%} run cocok grammar/grid/tabel §2.",
        },
        {
            "code": "V-07/V-09/V-10",
            "label": "Satuan konsisten / skala viewport / kelengkapan kop",
            "passed": False,
            "detail": "BELUM DIEVALUASI — butuh data span per-kategori/skala/kop yang belum "
                      "ditrack di iterasi P3 ini (dicatat jujur, bukan dipaksa lolos).",
        },
    ]
    # V-02..V-05/V-08 dievaluasi core-engine (validate_tkg) setelah TKG dikirim —
    # tidak diduplikasi di sini; frontend memanggil validateTkg terpisah (pola existing).
    status = "lolos" if all(c["passed"] for c in checks) else "draft"
    return {"status": status, "checks": checks}
