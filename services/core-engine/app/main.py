"""
PAAX Core Engine — FastAPI service (v0.6).

Endpoint deterministik (tidak ada LLM di sini):
    GET  /health
    GET  /ahsp                      -> daftar item AHSP
    GET  /ahsp/{code}               -> detail satu item
    GET  /regions                   -> daftar wilayah harga
    POST /rab/hsp                   -> rincian HSP satu item
    POST /rab/calculate             -> RAB lengkap dari daftar item
    POST /schedule/s-curve          -> Kurva S rencana dari RAB + durasi
"""
from __future__ import annotations
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .rab.loader import load_data
from .rab.rab import compute_hsp, compute_rab
from .rab.schedule import build_s_curve
from .rab.models import RABLineInput, HSPBreakdown, RABResult, SCurveResult

app = FastAPI(title="PAAX Core Engine", version="0.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # ketatkan di produksi
    allow_methods=["*"],
    allow_headers=["*"],
)

STORE = load_data()


# ----------------------------- Request bodies -----------------------------
class HSPRequest(BaseModel):
    ahsp_code: str
    region_code: str = "jateng"


class RABRequest(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    lines: List[RABLineInput]


class SCurveRequest(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    period_days: int = 7
    mode: str = "sequential"
    lines: List[RABLineInput]


# ----------------------------- Endpoints -----------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "0.6.0",
        "ahsp_items": len(STORE.ahsp),
        "regions": list(STORE.regions),
    }


@app.get("/ahsp")
def list_ahsp():
    return [
        {"code": i.code, "name": i.name, "unit": i.unit, "bidang": i.bidang}
        for i in STORE.ahsp.values()
    ]


@app.get("/ahsp/{code}")
def get_ahsp(code: str):
    item = STORE.ahsp.get(code)
    if item is None:
        raise HTTPException(404, f"Item AHSP '{code}' tidak ditemukan")
    return item


@app.get("/regions")
def list_regions():
    return [{"code": c, "name": n} for c, n in STORE.region_names.items()]


@app.post("/rab/hsp", response_model=HSPBreakdown)
def hsp(req: HSPRequest):
    item = STORE.ahsp.get(req.ahsp_code)
    if item is None:
        raise HTTPException(404, f"Item AHSP '{req.ahsp_code}' tidak ditemukan")
    try:
        return compute_hsp(item, STORE.price_book(req.region_code))
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.post("/rab/calculate", response_model=RABResult)
def calculate(req: RABRequest):
    try:
        return compute_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code,
            ppn_rate=req.ppn_rate,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.post("/schedule/s-curve", response_model=SCurveResult)
def s_curve(req: SCurveRequest):
    try:
        rab = compute_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code,
            ppn_rate=req.ppn_rate,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))
    return build_s_curve(rab, req.lines, period_days=req.period_days, mode=req.mode)
