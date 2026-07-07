"""
PAAX Core Engine — FastAPI service (v0.6).

Endpoint deterministik (tidak ada LLM di sini):
    GET  /health
    GET  /ahsp                      -> daftar item AHSP
    GET  /ahsp/{code}               -> detail satu item
    GET  /regions                   -> daftar wilayah harga
    POST /rab/hsp                   -> rincian HSP satu item
    POST /rab/calculate             -> RAB lengkap dari daftar item
    POST /rab/validate              -> health check RAB (deterministik)
    POST /rab/build                 -> RAB tersektor (WBS I..VII)
    POST /schedule/s-curve          -> Kurva S rencana dari RAB + durasi
    POST /schedule/cpm              -> Critical Path Method dari dependency tugas
    POST /schedule/plan             -> CPM + tanggal kalender + Kurva S dependency
    POST /scenario/simulate         -> simulasi what-if waktu-biaya (deterministik)
    GET  /geometry/elements         -> tipe elemen yang didukung kalkulator volume
    POST /geometry/volume           -> hitung volume/luas dari dimensi (untuk AI)
    POST /tkg/validate              -> validasi TKG (V-02..V-08 subset, brain TXT00 §7)
    POST /tkg/render                -> render TKG -> skrip .tkg.txt (deterministik)
    POST /tkg/takeoff               -> TKG -> WorkItem beton/bekisting/besi (deterministik)
    POST /tkg/takeoff-ahsp-suggest   -> takeoff + usulan AHSP per item (token-overlap, Fase T)
    POST /takeoff/tanah             -> galian/urugan/buangan (brain §F, deterministik)
    POST /takeoff/dinding           -> pasangan/plester/acian/cat/screed (brain §E)
    POST /takeoff/arsitektur        -> pondasi batu/lantai/atap miring (brain §G)
"""
from __future__ import annotations
import io
from typing import Dict, List, Optional, Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .export.excel_exporter import export_rab_to_excel
from .rab.loader import load_data
from .rab.rab import compute_hsp, compute_rab
from .rab.schedule import (
    build_s_curve, compute_cpm, build_schedule_plan,
    CPMRequest, CPMResult, SchedulePlanRequest, SchedulePlanResult,
)
from .rab.validate import validate_rab, ValidationResult
from .rab.sections import build_sectioned_rab, SectionedRABResult, WBS_SECTIONS
from .rab.models import RABLineInput, HSPBreakdown, RABResult, SCurveResult
from .scenario.simulate import compute_scenarios
from .scenario.models import ScenarioConfig, ScenarioResult
from .geometry.volume import compute_volume, ELEMENT_TYPES
from .geometry.models import VolumeRequest, VolumeResult
from .tkg.models import TkgDocument, TkgValidationResult
from .tkg.params import TakeoffParams
from .tkg.render import render_tkg_txt
from .tkg.takeoff import BbsResult, takeoff_tkg, TakeoffResult
from .tkg.validate import validate_tkg
from .takeoff.models import (
    ArsitekturRequest, AtapDetailRequest, BajaRequest, DindingRequest, KusenRequest,
    ManualTakeoffResult, MepRequest, TanahRequest,
)
from .takeoff.tanah import takeoff_tanah
from .takeoff.dinding import takeoff_dinding
from .takeoff.arsitektur import takeoff_arsitektur
from .takeoff.baja import takeoff_baja
from .takeoff.atap import takeoff_atap
from .takeoff.kusen import takeoff_kusen
from .takeoff.mep import takeoff_mep
from .takeoff.mep_advanced import MepAdvancedRequest, takeoff_mep_advanced
from .takeoff.smkk import SmkkRequest, takeoff_smkk
from .data_audit.coverage import audit_data_coverage
from .data_audit.models import DataCoverageResult
from .brain.confidence import score_confidence
from .brain.qa import run_qa
from .brain.boe import build_boe
from .brain.models import BrainBoe, BrainBoeRequest, ConfidenceResult, QaRequest, QaResult
from .eval.models import EvalRunRequest, EvalRunResult
from .eval.runner import run_eval
from .export.boe_exporter import export_bbs_payload, export_boe_payload
from .workitems.wbs import WBS_MASTER
from .workitems.completeness import check_wbs_completeness
from .workitems.expand import expand_elements
from .workitems.implied import implied_workitems
from .workitems.models import ElementSeed, ImpliedRequest, WbsCompletenessRequest, WbsCompletenessResult, WorkItemsResult
from .mapping.ahsp_search import map_workitem_to_ahsp, search_ahsp
from .mapping.price_binding import bind_prices
from .mapping.models import AhspMapRequest, AhspMapResult, AhspSearchRequest, AhspSearchResult, PriceBindRequest, PriceBindingResult
from .mapping.takeoff_ahsp import TakeoffAhspSuggestion, suggest_ahsp_for_takeoff
from .review.corrections import log_correction
from .review.models import CorrectionLogRequest, CorrectionRecord, ReviewTriageRequest, ReviewTriageResult
from .review.triage import triage_review_tasks

import os

app = FastAPI(title="PAAX Core Engine", version="0.6.0")

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
env_mode = os.environ.get("ENV", "development")

if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",")]
elif env_mode == "development":
    allowed_origins = ["*"]
else:
    allowed_origins = [] # Strict by default if not dev and no env provided

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import APIRouter, Depends
from .auth import get_current_user

api_router = APIRouter(dependencies=[Depends(get_current_user)])


STORE = load_data()


# ----------------------------- Request bodies -----------------------------
class HSPRequest(BaseModel):
    ahsp_code: str
    region_code: str = "jateng"
    as_of_date: Optional[str] = None


class RABRequest(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    overhead_override: Optional[float] = None
    rounding_mode: Literal["exact", "rounddown_int"] = "exact"
    as_of_date: Optional[str] = None
    lines: List[RABLineInput]


class SCurveRequest(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    period_days: int = 7
    mode: str = "sequential"
    as_of_date: Optional[str] = None
    lines: List[RABLineInput]


class ConfidenceRequest(BaseModel):
    method: str
    quality_score: float
    corroborations: int = 0
    conflicts: int = 0
    critical: bool = False
    weights: Optional[Dict[str, float]] = None
    ambang_conf: float = 0.7


# ----------------------------- Endpoints -----------------------------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "0.6.0",
        "ahsp_items": len(STORE.ahsp),
        "regions": list(STORE.regions),
    }


@api_router.get("/ahsp")
def list_ahsp():
    return [
        {"code": i.code, "name": i.name, "unit": i.unit, "bidang": i.bidang}
        for i in STORE.ahsp.values()
    ]


@api_router.get("/ahsp/{code}")
def get_ahsp(code: str):
    item = STORE.ahsp.get(code)
    if item is None:
        raise HTTPException(404, f"Item AHSP '{code}' tidak ditemukan")
    return item


@api_router.post("/ahsp/search", response_model=AhspSearchResult)
def ahsp_search(req: AhspSearchRequest):
    return search_ahsp(req, STORE.ahsp)


@api_router.post("/ahsp/map", response_model=AhspMapResult)
def ahsp_map(req: AhspMapRequest):
    return map_workitem_to_ahsp(req, STORE.ahsp)


@api_router.post("/price/bind", response_model=PriceBindingResult)
def price_bind(req: PriceBindRequest):
    try:
        return bind_prices(req, STORE.ahsp, STORE.price_book(req.region_code))
    except KeyError as e:
        raise HTTPException(400, str(e))


@api_router.get("/regions")
def list_regions():
    return [{"code": c, "name": n} for c, n in STORE.region_names.items()]


@api_router.get("/data/coverage", response_model=DataCoverageResult)
def data_coverage(region_code: str = "jateng"):
    try:
        return audit_data_coverage(STORE.ahsp, STORE.price_book(region_code), region_code)
    except KeyError as e:
        raise HTTPException(400, str(e))


@api_router.post("/rab/hsp", response_model=HSPBreakdown)
def hsp(req: HSPRequest):
    item = STORE.ahsp.get(req.ahsp_code)
    if item is None:
        raise HTTPException(404, f"Item AHSP '{req.ahsp_code}' tidak ditemukan")
    try:
        return compute_hsp(item, STORE.price_book(req.region_code, req.as_of_date))
    except KeyError as e:
        raise HTTPException(400, str(e))


@api_router.post("/rab/calculate", response_model=RABResult)
def calculate(req: RABRequest):
    try:
        return compute_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code, req.as_of_date),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code,
            ppn_rate=req.ppn_rate,
            overhead_override=req.overhead_override,
            rounding_mode=req.rounding_mode,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))


@api_router.post("/rab/validate", response_model=ValidationResult)
def rab_validate(req: RABRequest):
    try:
        book = STORE.price_book(req.region_code, req.as_of_date)
    except KeyError as e:
        raise HTTPException(400, str(e))
    return validate_rab(
        req.lines, STORE.ahsp, book,
        region=STORE.region_names.get(req.region_code, req.region_code),
        region_code=req.region_code, ppn_rate=req.ppn_rate,
    )


@api_router.post("/rab/build", response_model=SectionedRABResult)
def rab_build(req: RABRequest):
    try:
        return build_sectioned_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code, req.as_of_date),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code, ppn_rate=req.ppn_rate,
            overhead_override=req.overhead_override, rounding_mode=req.rounding_mode,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))


@api_router.post("/rab/export/excel")
def rab_export_excel(req: RABRequest):
    try:
        book = STORE.price_book(req.region_code, req.as_of_date)
        result = build_sectioned_rab(
            req.lines, STORE.ahsp, book,
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code, ppn_rate=req.ppn_rate,
            overhead_override=req.overhead_override, rounding_mode=req.rounding_mode,
        )
        unique_codes = []
        seen = set()
        for li in req.lines:
            if li.ahsp_code not in seen:
                seen.add(li.ahsp_code)
                unique_codes.append(li.ahsp_code)
        breakdowns = {
            code: compute_hsp(
                STORE.ahsp[code],
                book,
                overhead_override=req.overhead_override,
                rounding_mode=req.rounding_mode,
            )
            for code in unique_codes
        }
        xlsx_bytes = export_rab_to_excel(result, breakdowns)
    except KeyError as e:
        raise HTTPException(400, str(e))
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=RAB_export.xlsx"},
    )


@api_router.get("/wbs/sections")
def wbs_sections():
    return [{"code": code, "title": title} for code, title in WBS_SECTIONS]


@api_router.get("/wbs/master")
def wbs_master():
    return WBS_MASTER


@api_router.post("/workitems/completeness", response_model=WbsCompletenessResult)
def workitems_completeness(req: WbsCompletenessRequest):
    return check_wbs_completeness(req)


class WorkItemExpandRequest(BaseModel):
    prj_id: str = "PRJ"
    elements: List[ElementSeed]


@api_router.post("/workitems/expand", response_model=WorkItemsResult)
def workitems_expand(req: WorkItemExpandRequest):
    return expand_elements(req.elements, req.prj_id)


@api_router.post("/workitems/implied", response_model=WorkItemsResult)
def workitems_implied(req: ImpliedRequest):
    return implied_workitems(req)


@api_router.get("/geometry/elements")
def geometry_elements():
    return {"element_types": ELEMENT_TYPES}


@api_router.post("/geometry/volume", response_model=VolumeResult)
def geometry_volume(req: VolumeRequest):
    try:
        return compute_volume(req.element_type, req.dims)
    except KeyError as e:
        raise HTTPException(400, str(e))


# ----------------------------- TKG (brain v4.1) -----------------------------
class TkgRequest(BaseModel):
    doc: TkgDocument
    params: Optional[TakeoffParams] = None


class TkgRenderResult(BaseModel):
    text: str


@api_router.post("/tkg/validate", response_model=TkgValidationResult)
def tkg_validate(req: TkgRequest):
    return validate_tkg(req.doc, req.params)


@api_router.post("/tkg/render", response_model=TkgRenderResult)
def tkg_render(req: TkgRequest):
    validation = validate_tkg(req.doc, req.params)
    return TkgRenderResult(text=render_tkg_txt(req.doc, validation))


@api_router.post("/tkg/takeoff", response_model=TakeoffResult)
def tkg_takeoff(req: TkgRequest):
    return takeoff_tkg(req.doc, req.params)


class TakeoffAhspSuggestResult(BaseModel):
    """Fase T (2026-07-13): takeoff + usulan AHSP per item, digabung supaya
    frontend cukup 1 panggilan. `takeoff` PERSIS sama dgn `/tkg/takeoff` —
    field baru murni tambahan, tidak mengubah kontrak lama."""
    takeoff: TakeoffResult
    suggestions: List[TakeoffAhspSuggestion]


@api_router.post("/tkg/takeoff-ahsp-suggest", response_model=TakeoffAhspSuggestResult)
def tkg_takeoff_ahsp_suggest(req: TkgRequest):
    takeoff = takeoff_tkg(req.doc, req.params)
    suggestions = suggest_ahsp_for_takeoff(takeoff.items, STORE.ahsp)
    return TakeoffAhspSuggestResult(takeoff=takeoff, suggestions=suggestions)


# ----------------- Take-off arsitektur/tanah (brain §E/§F/§G) ----------------
@api_router.post("/takeoff/tanah", response_model=ManualTakeoffResult)
def takeoff_tanah_ep(req: TanahRequest):
    return takeoff_tanah(req)


@api_router.post("/takeoff/dinding", response_model=ManualTakeoffResult)
def takeoff_dinding_ep(req: DindingRequest):
    return takeoff_dinding(req)


@api_router.post("/takeoff/arsitektur", response_model=ManualTakeoffResult)
def takeoff_arsitektur_ep(req: ArsitekturRequest):
    return takeoff_arsitektur(req)


@api_router.post("/takeoff/baja", response_model=ManualTakeoffResult)
def takeoff_baja_ep(req: BajaRequest):
    return takeoff_baja(req)


@api_router.post("/takeoff/atap", response_model=ManualTakeoffResult)
def takeoff_atap_ep(req: AtapDetailRequest):
    return takeoff_atap(req)


@api_router.post("/takeoff/kusen", response_model=ManualTakeoffResult)
def takeoff_kusen_ep(req: KusenRequest):
    return takeoff_kusen(req)


@api_router.post("/takeoff/mep", response_model=ManualTakeoffResult)
def takeoff_mep_ep(req: MepRequest):
    return takeoff_mep(req)


# Konsisten dgn endpoint takeoff lain (tanpa prefix /v1 — satu konvensi API)
@api_router.post("/takeoff/mep-advanced", response_model=ManualTakeoffResult)
def takeoff_mep_advanced_ep(req: MepAdvancedRequest):
    return takeoff_mep_advanced(req)


@api_router.post("/takeoff/smkk", response_model=ManualTakeoffResult)
def takeoff_smkk_ep(req: SmkkRequest):
    return takeoff_smkk(req)


# ----------------------------- Brain audit primitives -----------------------------
@api_router.post("/brain/confidence", response_model=ConfidenceResult)
def brain_confidence(req: ConfidenceRequest):
    return score_confidence(
        method=req.method,
        quality_score=req.quality_score,
        corroborations=req.corroborations,
        conflicts=req.conflicts,
        critical=req.critical,
        weights=req.weights,
        ambang_conf=req.ambang_conf,
    )


@api_router.post("/brain/qa", response_model=QaResult)
def brain_qa(req: QaRequest):
    return run_qa(req)


@api_router.post("/brain/boe", response_model=BrainBoe)
def brain_boe(req: BrainBoeRequest):
    return build_boe(req)


@api_router.post("/review/triage", response_model=ReviewTriageResult)
def review_triage(req: ReviewTriageRequest):
    return triage_review_tasks(req)


@api_router.post("/review/corrections", response_model=CorrectionRecord)
def review_corrections(req: CorrectionLogRequest):
    return log_correction(req)


@api_router.post("/eval/run", response_model=EvalRunResult)
def eval_run(req: EvalRunRequest):
    return run_eval(req)


@api_router.post("/export/boe")
def export_boe(req: BrainBoe):
    return export_boe_payload(req)


@api_router.post("/export/bbs")
def export_bbs(req: BbsResult):
    return export_bbs_payload(req)


@api_router.post("/schedule/s-curve", response_model=SCurveResult)
def s_curve(req: SCurveRequest):
    try:
        rab = compute_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code, req.as_of_date),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code,
            ppn_rate=req.ppn_rate,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))
    return build_s_curve(rab, req.lines, period_days=req.period_days, mode=req.mode)


@api_router.post("/schedule/cpm", response_model=CPMResult)
def schedule_cpm(req: CPMRequest):
    try:
        return compute_cpm(req)
    except ValueError as e:
        raise HTTPException(400, str(e))


@api_router.post("/schedule/plan", response_model=SchedulePlanResult)
def schedule_plan(req: SchedulePlanRequest):
    try:
        return build_schedule_plan(req)
    except ValueError as e:
        raise HTTPException(400, str(e))


@api_router.post("/scenario/simulate", response_model=ScenarioResult)
def scenario_simulate(req: ScenarioConfig):
    try:
        return compute_scenarios(
            req, STORE.ahsp, STORE.price_book(req.region_code, req.as_of_date),
            region=STORE.region_names.get(req.region_code, req.region_code),
        )
    except KeyError as e:
        raise HTTPException(400, str(e))

app.include_router(api_router)
