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
from .review.corrections import log_correction
from .review.models import CorrectionLogRequest, CorrectionRecord, ReviewTriageRequest, ReviewTriageResult
from .review.triage import triage_review_tasks

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
    overhead_override: Optional[float] = None
    rounding_mode: Literal["exact", "rounddown_int"] = "exact"
    lines: List[RABLineInput]


class SCurveRequest(BaseModel):
    region_code: str = "jateng"
    ppn_rate: float = 0.11
    period_days: int = 7
    mode: str = "sequential"
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


@app.post("/ahsp/search", response_model=AhspSearchResult)
def ahsp_search(req: AhspSearchRequest):
    return search_ahsp(req, STORE.ahsp)


@app.post("/ahsp/map", response_model=AhspMapResult)
def ahsp_map(req: AhspMapRequest):
    return map_workitem_to_ahsp(req, STORE.ahsp)


@app.post("/price/bind", response_model=PriceBindingResult)
def price_bind(req: PriceBindRequest):
    try:
        return bind_prices(req, STORE.ahsp, STORE.price_book(req.region_code))
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.get("/regions")
def list_regions():
    return [{"code": c, "name": n} for c, n in STORE.region_names.items()]


@app.get("/data/coverage", response_model=DataCoverageResult)
def data_coverage(region_code: str = "jateng"):
    try:
        return audit_data_coverage(STORE.ahsp, STORE.price_book(region_code), region_code)
    except KeyError as e:
        raise HTTPException(400, str(e))


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
            overhead_override=req.overhead_override,
            rounding_mode=req.rounding_mode,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.post("/rab/validate", response_model=ValidationResult)
def rab_validate(req: RABRequest):
    try:
        book = STORE.price_book(req.region_code)
    except KeyError as e:
        raise HTTPException(400, str(e))
    return validate_rab(
        req.lines, STORE.ahsp, book,
        region=STORE.region_names.get(req.region_code, req.region_code),
        region_code=req.region_code, ppn_rate=req.ppn_rate,
    )


@app.post("/rab/build", response_model=SectionedRABResult)
def rab_build(req: RABRequest):
    try:
        return build_sectioned_rab(
            req.lines, STORE.ahsp, STORE.price_book(req.region_code),
            region=STORE.region_names.get(req.region_code, req.region_code),
            region_code=req.region_code, ppn_rate=req.ppn_rate,
            overhead_override=req.overhead_override, rounding_mode=req.rounding_mode,
        )
    except KeyError as e:
        raise HTTPException(400, str(e))


@app.post("/rab/export/excel")
def rab_export_excel(req: RABRequest):
    try:
        book = STORE.price_book(req.region_code)
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


@app.get("/wbs/sections")
def wbs_sections():
    return [{"code": code, "title": title} for code, title in WBS_SECTIONS]


@app.get("/wbs/master")
def wbs_master():
    return WBS_MASTER


@app.post("/workitems/completeness", response_model=WbsCompletenessResult)
def workitems_completeness(req: WbsCompletenessRequest):
    return check_wbs_completeness(req)


class WorkItemExpandRequest(BaseModel):
    prj_id: str = "PRJ"
    elements: List[ElementSeed]


@app.post("/workitems/expand", response_model=WorkItemsResult)
def workitems_expand(req: WorkItemExpandRequest):
    return expand_elements(req.elements, req.prj_id)


@app.post("/workitems/implied", response_model=WorkItemsResult)
def workitems_implied(req: ImpliedRequest):
    return implied_workitems(req)


@app.get("/geometry/elements")
def geometry_elements():
    return {"element_types": ELEMENT_TYPES}


@app.post("/geometry/volume", response_model=VolumeResult)
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


@app.post("/tkg/validate", response_model=TkgValidationResult)
def tkg_validate(req: TkgRequest):
    return validate_tkg(req.doc, req.params)


@app.post("/tkg/render", response_model=TkgRenderResult)
def tkg_render(req: TkgRequest):
    validation = validate_tkg(req.doc, req.params)
    return TkgRenderResult(text=render_tkg_txt(req.doc, validation))


@app.post("/tkg/takeoff", response_model=TakeoffResult)
def tkg_takeoff(req: TkgRequest):
    return takeoff_tkg(req.doc, req.params)


# ----------------- Take-off arsitektur/tanah (brain §E/§F/§G) ----------------
@app.post("/takeoff/tanah", response_model=ManualTakeoffResult)
def takeoff_tanah_ep(req: TanahRequest):
    return takeoff_tanah(req)


@app.post("/takeoff/dinding", response_model=ManualTakeoffResult)
def takeoff_dinding_ep(req: DindingRequest):
    return takeoff_dinding(req)


@app.post("/takeoff/arsitektur", response_model=ManualTakeoffResult)
def takeoff_arsitektur_ep(req: ArsitekturRequest):
    return takeoff_arsitektur(req)


@app.post("/takeoff/baja", response_model=ManualTakeoffResult)
def takeoff_baja_ep(req: BajaRequest):
    return takeoff_baja(req)


@app.post("/takeoff/atap", response_model=ManualTakeoffResult)
def takeoff_atap_ep(req: AtapDetailRequest):
    return takeoff_atap(req)


@app.post("/takeoff/kusen", response_model=ManualTakeoffResult)
def takeoff_kusen_ep(req: KusenRequest):
    return takeoff_kusen(req)


@app.post("/takeoff/mep", response_model=ManualTakeoffResult)
def takeoff_mep_ep(req: MepRequest):
    return takeoff_mep(req)


# Konsisten dgn endpoint takeoff lain (tanpa prefix /v1 — satu konvensi API)
@app.post("/takeoff/mep-advanced", response_model=ManualTakeoffResult)
def takeoff_mep_advanced_ep(req: MepAdvancedRequest):
    return takeoff_mep_advanced(req)


@app.post("/takeoff/smkk", response_model=ManualTakeoffResult)
def takeoff_smkk_ep(req: SmkkRequest):
    return takeoff_smkk(req)


# ----------------------------- Brain audit primitives -----------------------------
@app.post("/brain/confidence", response_model=ConfidenceResult)
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


@app.post("/brain/qa", response_model=QaResult)
def brain_qa(req: QaRequest):
    return run_qa(req)


@app.post("/brain/boe", response_model=BrainBoe)
def brain_boe(req: BrainBoeRequest):
    return build_boe(req)


@app.post("/review/triage", response_model=ReviewTriageResult)
def review_triage(req: ReviewTriageRequest):
    return triage_review_tasks(req)


@app.post("/review/corrections", response_model=CorrectionRecord)
def review_corrections(req: CorrectionLogRequest):
    return log_correction(req)


@app.post("/eval/run", response_model=EvalRunResult)
def eval_run(req: EvalRunRequest):
    return run_eval(req)


@app.post("/export/boe")
def export_boe(req: BrainBoe):
    return export_boe_payload(req)


@app.post("/export/bbs")
def export_bbs(req: BbsResult):
    return export_bbs_payload(req)


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


@app.post("/schedule/cpm", response_model=CPMResult)
def schedule_cpm(req: CPMRequest):
    try:
        return compute_cpm(req)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/schedule/plan", response_model=SchedulePlanResult)
def schedule_plan(req: SchedulePlanRequest):
    try:
        return build_schedule_plan(req)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/scenario/simulate", response_model=ScenarioResult)
def scenario_simulate(req: ScenarioConfig):
    try:
        return compute_scenarios(
            req, STORE.ahsp, STORE.price_book(req.region_code),
            region=STORE.region_names.get(req.region_code, req.region_code),
        )
    except KeyError as e:
        raise HTTPException(400, str(e))
