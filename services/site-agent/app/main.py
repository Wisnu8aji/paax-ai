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
from typing import Any, Optional

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

CORE_ENGINE_URL = os.getenv("CORE_ENGINE_URL", "http://127.0.0.1:8081")
DB_API_URL = os.getenv("DB_API_URL", "http://127.0.0.1:8084")
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")

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


from paax_db.runtime_identity import get_runtime_identity

@app.get("/healthz")
@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "site-agent",
        "version": "0.1.0",
        "runtime_identity": get_runtime_identity("site-agent"),
    }


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
    db_url: Optional[str] = Query(None, description="Override URL db-api (testing)"),
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

    # 2. Panggil db-api untuk RAB, lalu core-engine untuk planned progress.
    engine_url = core_url or CORE_ENGINE_URL
    storage_url = db_url or DB_API_URL
    planned_progress_pct = await _planned_progress_from_services(
        project_id=project_id,
        planned_day=planned_day,
        period_days=period_days,
        db_url=storage_url,
        core_url=engine_url,
    )
    if planned_progress_pct is None:
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


async def _planned_progress_from_services(
    *,
    project_id: str,
    planned_day: int,
    period_days: int,
    db_url: str,
    core_url: str,
) -> float | None:
    if not db_url or not core_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            rab_payload = await _fetch_rab_payload(client, db_url, project_id)
            lines = rab_payload.get("lines") if isinstance(rab_payload, dict) else None
            if not isinstance(lines, list) or not lines:
                return None

            s_curve = await _fetch_s_curve(
                client,
                core_url,
                lines=lines,
                period_days=period_days,
                region_code=str(rab_payload.get("region_code") or "jateng"),
                ppn_rate=float(rab_payload.get("ppn_rate") or 0.11),
                mode=str(rab_payload.get("schedule_mode") or "sequential"),
                as_of_date=rab_payload.get("as_of_date"),
            )
            return _planned_progress_at_day(s_curve, planned_day)
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        return None


async def _fetch_rab_payload(
    client: httpx.AsyncClient,
    db_url: str,
    project_id: str,
) -> dict[str, Any]:
    headers = {}
    if INTERNAL_SERVICE_KEY:
        headers["X-Internal-Key"] = INTERNAL_SERVICE_KEY
    response = await client.get(f"{db_url.rstrip('/')}/projects/{project_id}/rab", headers=headers)
    response.raise_for_status()
    data = response.json()
    payload = data.get("payload") if isinstance(data, dict) else None
    return payload if isinstance(payload, dict) else {}


async def _fetch_s_curve(
    client: httpx.AsyncClient,
    core_url: str,
    *,
    lines: list[dict[str, Any]],
    period_days: int,
    region_code: str,
    ppn_rate: float,
    mode: str,
    as_of_date: Any,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "region_code": region_code,
        "ppn_rate": ppn_rate,
        "period_days": period_days,
        "mode": mode,
        "lines": lines,
    }
    if as_of_date:
        body["as_of_date"] = as_of_date
    response = await client.post(f"{core_url.rstrip('/')}/schedule/s-curve", json=body)
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, dict) else {}


def _planned_progress_at_day(s_curve: dict[str, Any], planned_day: int) -> float | None:
    points = s_curve.get("points")
    if not isinstance(points, list) or not points:
        return None
    for point in points:
        if not isinstance(point, dict):
            continue
        day_end = int(point.get("day_end") or 0)
        if planned_day <= day_end:
            return round(float(point.get("cumulative_pct") or 0.0), 4)
    last = points[-1]
    if isinstance(last, dict):
        return round(float(last.get("cumulative_pct") or 0.0), 4)
    return None


def _estimate_planned_progress(planned_day: int, total_days: int) -> float:
    """
    Estimasi progres rencana berdasarkan posisi hari (linear).
    Ini adalah estimasi scaffold — di v2.0 diganti dengan panggilan ke core-engine
    dengan data RAB aktual.
    """
    if total_days <= 0:
        return 0.0
    return round(min(100.0, (planned_day / total_days) * 100.0), 4)
