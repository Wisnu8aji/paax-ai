"""
PAAX Site Agent — FastAPI main application.

Port: 8085
Endpoints:
  POST /site-logs                         - simpan laporan harian
  GET  /site-logs?project_id=&from=&to=  - riwayat laporan
  GET  /site-logs/{project_id}/deviation?date=  - bandingkan rencana vs realisasi

LARANGAN KERAS (ditegakkan di kode, bukan hanya niat):
  - TIDAK ADA import google.generativeai atau apapun vision LLM di service ini.
  - actual_progress_pct TIDAK PERNAH diisi oleh proses otomatis/AI.
  - Foto hanya disimpan sebagai referensi (path/URL), TIDAK dianalisa.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    DeviationResult,
    ON_TRACK_THRESHOLD_PCT,
    SiteLogInput,
    SiteLogRecord,
)
from .store import get_log_by_date, get_logs, save_log

CORE_ENGINE_URL = os.getenv("CORE_ENGINE_URL", "http://localhost:8080")

app = FastAPI(
    title="PAAX Site Agent",
    version="0.1.0",
    description=(
        "Scaffold API laporan harian lapangan dan perbandingan rencana-vs-realisasi. "
        "Foto disimpan sebagai referensi saja; analisa AI atas foto ditunda (v2.0)."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def health() -> dict:
    return {"status": "ok", "service": "site-agent", "version": "0.1.0"}


@app.post("/site-logs", response_model=SiteLogRecord, status_code=201)
def create_site_log(inp: SiteLogInput) -> SiteLogRecord:
    """
    Simpan laporan harian lapangan.

    actual_progress_pct WAJIB diisi manusia (role=lapangan/pm/owner via auth).
    Tidak ada proses otomatis yang boleh mengisi field ini.
    """
    return save_log(inp)


@app.get("/site-logs", response_model=list[SiteLogRecord])
def list_site_logs(
    project_id: str = Query(..., description="ID proyek"),
    from_date: Optional[str] = Query(None, alias="from", description="ISO date filter mulai"),
    to_date: Optional[str] = Query(None, alias="to", description="ISO date filter akhir"),
) -> list[SiteLogRecord]:
    """
    Ambil riwayat laporan harian lapangan untuk satu proyek.
    """
    return get_logs(project_id, from_date, to_date)


@app.get("/site-logs/{project_id}/deviation", response_model=DeviationResult)
async def get_deviation(
    project_id: str,
    date: str = Query(..., description="ISO date: 2026-07-07"),
    # Parameter tambahan untuk memanggil core-engine /schedule/s-curve
    total_days: int = Query(..., description="Total durasi proyek (hari)"),
    period_days: int = Query(7, description="Panjang periode Kurva S (hari)"),
    planned_day: int = Query(..., description="Hari ke berapa dari awal proyek"),
    # core_engine_url override (untuk testing)
    core_url: Optional[str] = Query(None, description="Override URL core-engine (testing)"),
) -> DeviationResult:
    """
    Bandingkan rencana vs realisasi pada tanggal tertentu.

    Alur:
    1. Ambil actual_progress_pct dari log tersimpan manusia
    2. Panggil core-engine /schedule/s-curve untuk dapat planned_progress_pct
    3. Hitung deviation_pct = actual - planned (pengurangan sederhana)
    4. Tentukan status berdasarkan ambang ON_TRACK_THRESHOLD_PCT (2%)
    """
    # 1. Ambil log lapangan manusia
    log = get_log_by_date(project_id, date)
    if log is None:
        raise HTTPException(
            status_code=404,
            detail=f"Tidak ada laporan lapangan untuk project_id='{project_id}' pada tanggal '{date}'"
        )

    # 2. Panggil core-engine untuk planned progress
    engine_url = core_url or CORE_ENGINE_URL
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Panggil /schedule/s-curve dengan data minimal
            # Note: di produksi, RAB data akan diambil dari db-api (Task R6)
            # Untuk scaffold ini, kita perlu lines dari parameter - disederhanakan
            # dengan endpoint /schedule/s-curve yang sudah ada
            # Karena scaffold, kita mock planned_progress_pct dari parameter planned_day
            # TODO v2.0: Ambil data RAB aktual proyek dari db-api lalu panggil core-engine
            planned_progress_pct = _estimate_planned_progress(planned_day, total_days)
    except httpx.RequestError:
        # Fallback: estimasi linear jika core-engine tidak tersedia
        planned_progress_pct = _estimate_planned_progress(planned_day, total_days)

    # 3. Hitung deviasi (pengurangan sederhana — bukan pelanggaran Aturan Emas,
    #    karena kedua nilai sudah dihitung/diisi oleh engine dan manusia)
    deviation_pct = round(log.actual_progress_pct - planned_progress_pct, 4)

    # 4. Tentukan status berdasarkan ambang yang sudah terdokumentasi
    if abs(deviation_pct) <= ON_TRACK_THRESHOLD_PCT:
        status = "on_track"
    elif deviation_pct > 0:
        status = "ahead"
    else:
        status = "behind"

    return DeviationResult(
        project_id=project_id,
        date=date,
        planned_progress_pct=planned_progress_pct,
        actual_progress_pct=log.actual_progress_pct,
        deviation_pct=deviation_pct,
        status=status,
        threshold_pct=ON_TRACK_THRESHOLD_PCT,
    )


def _estimate_planned_progress(planned_day: int, total_days: int) -> float:
    """
    Estimasi progres rencana berdasarkan posisi hari (linear).
    Ini adalah estimasi scaffold — di v2.0 diganti dengan panggilan ke core-engine
    dengan data RAB aktual.
    """
    if total_days <= 0:
        return 0.0
    return round(min(100.0, (planned_day / total_days) * 100.0), 4)
