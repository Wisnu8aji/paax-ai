"""
Demo cepat engine — jalankan: python -m app.demo  (dari folder services/core-engine)
Menampilkan HSP, RAB, dan Kurva S dari data contoh tanpa perlu server HTTP.
"""
from __future__ import annotations
from .rab.loader import load_data
from .rab.rab import compute_hsp, compute_rab
from .rab.schedule import build_s_curve
from .rab.models import RABLineInput


def rp(x: float) -> str:
    return f"Rp {x:,.0f}".replace(",", ".")


def main() -> None:
    store = load_data()
    region = "jateng"
    book = store.price_book(region)

    print("=" * 64)
    print("PAAX Core Engine — Demo (data ILUSTRATIF)")
    print("=" * 64)

    print("\n[1] Rincian HSP — AHSP.CK.001 (dinding bata 1/2 batu)")
    h = compute_hsp(store.ahsp["AHSP.CK.001"], book)
    print(f"    Bahan (A) : {rp(h.bahan)}")
    print(f"    Upah  (B) : {rp(h.upah)}")
    print(f"    Alat  (C) : {rp(h.alat)}")
    print(f"    Base      : {rp(h.base)}")
    print(f"    Overhead+Profit ({h.overhead_profit:.0%}) : {rp(h.overhead_profit_value)}")
    print(f"    HSP / {h.unit} : {rp(h.hsp)}")

    print("\n[2] RAB (4 item)")
    lines = [
        RABLineInput(ahsp_code="AHSP.CK.001", volume=120, duration_days=6),
        RABLineInput(ahsp_code="AHSP.CK.002", volume=240, duration_days=8),
        RABLineInput(ahsp_code="AHSP.CK.003", volume=18,  duration_days=5),
        RABLineInput(ahsp_code="AHSP.CK.004", volume=85,  duration_days=7),
    ]
    rab = compute_rab(lines, store.ahsp, book, region="Jawa Tengah",
                      region_code=region, ppn_rate=0.11)
    for ln in rab.lines:
        print(f"    {ln.ahsp_code}  {ln.name[:34]:34}  "
              f"{ln.volume:>7} {ln.unit:3}  HSP {rp(ln.hsp):>16}  "
              f"= {rp(ln.amount):>18}  ({ln.weight_pct:5.2f}%)")
    print(f"    {'Subtotal':>96} : {rp(rab.subtotal)}")
    print(f"    {'PPN ' + format(rab.ppn_rate, '.0%'):>96} : {rp(rab.ppn)}")
    print(f"    {'RAB TOTAL':>96} : {rp(rab.total)}")

    print("\n[3] Kurva S (mingguan, sequential)")
    sc = build_s_curve(rab, lines, period_days=7, mode="sequential")
    print(f"    Total durasi: {sc.total_days} hari, {len(sc.points)} minggu")
    for p in sc.points:
        bar = "█" * int(p.cumulative_pct / 2)
        print(f"    Minggu {p.period:>2} (hari {p.day_start:>2}-{p.day_end:<2})  "
              f"+{p.planned_pct:5.2f}%  kum {p.cumulative_pct:6.2f}%  {bar}")
    print()


if __name__ == "__main__":
    main()
