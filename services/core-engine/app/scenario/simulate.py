"""
PAAX Core Engine — Simulasi Skenario What-If (deterministik, auditable).

Membangun "frontier waktu-biaya" ala ALICE, TETAPI dengan matematika
deterministik penuh (tanpa AI): tiap skenario adalah perhitungan eksak dari
produktivitas AHSP + engine RAB. AI (nanti) hanya menarasikan hasil ini.

Skenario:
  - baseline      : rencana awal (sequential/parallel sesuai base_mode)
  - tambah_crew   : pekerja × crew_factor → durasi ÷ crew_factor; biaya tenaga
                    tetap (orang-hari sama, hanya lebih banyak orang).
  - lembur        : laju × overtime_speedup → durasi ÷ speedup; biaya tenaga
                    × overtime_cost_factor (premi lembur).
  - paralel       : pekerjaan independen serempak → durasi = max; biaya tetap.
"""
from __future__ import annotations
from typing import Dict, List

from ..rab.models import AHSPItem, ResourcePrice, RABLineInput
from ..rab.rab import compute_hsp, compute_rab
from .models import (
    ScenarioConfig, ScenarioLineInput, ItemSchedule,
    ScenarioCandidate, ScenarioResult, CustomItemSchedule, CustomScenarioResult,
)


def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def _r4(x: float) -> float:
    return round(x + 1e-9, 4)


def labor_oh_per_unit(item: AHSPItem) -> float:
    """Σ koefisien komponen upah (orang-hari per satuan pekerjaan)."""
    return sum(c.coefficient for c in item.components if c.category == "upah")


def item_schedule(line: ScenarioLineInput, item: AHSPItem) -> ItemSchedule:
    oh = labor_oh_per_unit(item)
    mandays = line.volume * oh
    workers = max(1, line.workers)
    return ItemSchedule(
        ahsp_code=item.code,
        name=item.name,
        unit=item.unit,
        volume=line.volume,
        labor_oh_per_unit=_r4(oh),
        mandays=_r4(mandays),
        workers=workers,
        duration_days=_r4(mandays / workers),
    )


def project_days(durations: List[float], mode: str) -> float:
    if not durations:
        return 0.0
    return sum(durations) if mode == "sequential" else max(durations)


def _custom_scenario(
    cfg: ScenarioConfig,
    items: List[ItemSchedule],
    subtotal: float,
    base_total: float,
    base_days: float,
    base_labor_cost: float,
) -> CustomScenarioResult | None:
    if cfg.params is None:
        return None

    params = cfg.params
    project_days_at_c1 = project_days(
        [
            item.mandays / (item.workers * params.shifts * params.efficiency)
            for item in items
        ],
        cfg.base_mode,
    )
    if params.target_days is not None:
        crew_multiplier = project_days_at_c1 / params.target_days
        resolved_from_target = True
    else:
        crew_multiplier = params.crew_multiplier
        resolved_from_target = False

    custom_items: List[CustomItemSchedule] = []
    durations: List[float] = []
    for item in items:
        effective_workers = item.workers * crew_multiplier * params.shifts * params.efficiency
        duration = item.mandays / effective_workers
        custom_items.append(CustomItemSchedule(
            ahsp_code=item.ahsp_code,
            name=item.name,
            volume=item.volume,
            base_mandays=item.mandays,
            effective_workers=_r4(effective_workers),
            duration_days=duration,
        ))
        durations.append(duration)

    total_days_raw = project_days(durations, cfg.base_mode)
    shift_cost_factor = 1 + (params.shifts - 1) * params.shift_premium_rate
    labor_cost = base_labor_cost * shift_cost_factor / params.efficiency
    custom_subtotal = subtotal - base_labor_cost + labor_cost
    total_cost = custom_subtotal * (1 + cfg.ppn_rate)
    total_days = _r2(total_days_raw)
    total_cost_rounded = _r2(total_cost)
    delta_days = _r2(total_days_raw - base_days)
    delta_cost = _r2(total_cost - base_total)

    return CustomScenarioResult(
        applied_crew_multiplier=_r4(crew_multiplier),
        shifts=params.shifts,
        efficiency=params.efficiency,
        target_days=params.target_days,
        resolved_from_target=resolved_from_target,
        items=custom_items,
        total_days=total_days,
        subtotal=custom_subtotal,
        labor_cost=labor_cost,
        total_cost=total_cost_rounded,
        delta_days=delta_days,
        delta_cost=delta_cost,
        delta_days_pct=round((total_days_raw - base_days) / base_days * 100, 2) if base_days else 0.0,
        delta_cost_pct=round((total_cost - base_total) / base_total * 100, 2) if base_total else 0.0,
        note="Skenario kustom dari parameter crew, shift, efisiensi, dan target.",
    )


def compute_scenarios(
    cfg: ScenarioConfig,
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
    region: str,
) -> ScenarioResult:
    # Biaya baseline dari engine RAB (sumber kebenaran angka biaya).
    rab = compute_rab(
        [RABLineInput(ahsp_code=l.ahsp_code, volume=l.volume) for l in cfg.lines],
        ahsp_index, price_book,
        region=region, region_code=cfg.region_code, ppn_rate=cfg.ppn_rate,
    )

    items: List[ItemSchedule] = []
    durations: List[float] = []
    labor_cost = 0.0
    for line in cfg.lines:
        item = ahsp_index.get(line.ahsp_code)
        if item is None:
            raise KeyError(f"Item AHSP '{line.ahsp_code}' tidak ditemukan.")
        hsp = compute_hsp(item, price_book)
        # Porsi tenaga kerja pada subtotal: volume × upah × (1 + overhead_profit).
        labor_cost += line.volume * hsp.upah * (1 + item.overhead_profit)
        sched = item_schedule(line, item)
        items.append(sched)
        durations.append(sched.duration_days)

    labor_cost = _r2(labor_cost)
    subtotal = rab.subtotal
    base_total = rab.total
    base_days = project_days(durations, cfg.base_mode)

    candidates: List[ScenarioCandidate] = []

    def add(key: str, label: str, days: float, total: float, note: str) -> None:
        days = _r2(days)
        total = _r2(total)
        candidates.append(ScenarioCandidate(
            key=key, label=label, total_days=days, total_cost=total,
            delta_days=_r2(days - base_days), delta_cost=_r2(total - base_total),
            delta_days_pct=round((days - base_days) / base_days * 100, 2) if base_days else 0.0,
            delta_cost_pct=round((total - base_total) / base_total * 100, 2) if base_total else 0.0,
            note=note,
        ))

    add("baseline", "Baseline", base_days, base_total, "Rencana awal")

    crew_days = project_days([d / cfg.crew_factor for d in durations], cfg.base_mode)
    add("tambah_crew", f"Tambah crew x{cfg.crew_factor:g}", crew_days, base_total,
        "Pekerja diperbanyak; biaya tenaga ~tetap (orang-hari sama)")

    ot_days = project_days([d / cfg.overtime_speedup for d in durations], cfg.base_mode)
    ot_subtotal = subtotal - labor_cost + labor_cost * cfg.overtime_cost_factor
    ot_total = ot_subtotal * (1 + cfg.ppn_rate)
    add("lembur", f"Lembur (laju x{cfg.overtime_speedup:g})", ot_days, ot_total,
        f"Durasi lebih pendek; biaya tenaga premi x{cfg.overtime_cost_factor:g}")

    par_days = project_days(durations, "parallel")
    add("paralel", "Paralel maksimal", par_days, base_total,
        "Pekerjaan independen serempak; biaya ~tetap")

    return ScenarioResult(
        region=region,
        region_code=cfg.region_code,
        base_mode=cfg.base_mode,
        items=items,
        baseline_total_days=_r2(base_days),
        baseline_total_cost=_r2(base_total),
        baseline_labor_cost=labor_cost,
        candidates=candidates,
        custom=_custom_scenario(cfg, items, subtotal, base_total, base_days, labor_cost),
    )
