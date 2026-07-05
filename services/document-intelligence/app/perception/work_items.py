from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.perception.bridging_atap import (
    AtapTakeoffClient,
    bridge_gording,
    bridge_ikatan_angin,
    bridge_trekstang,
)
from app.perception.bridging_arsitektur_area import (
    ArsitekturTakeoffClient,
    bridge_keramik_dinding,
    bridge_plafon,
    bridge_waterproofing,
)
from app.perception.bridging_dinding import DindingTakeoffClient, bridge_dinding_pasangan
from app.perception.bridging_kuda_kuda import BajaTakeoffClient, bridge_kuda_kuda
from app.perception.bridging_kusen import KusenTakeoffClient, bridge_kusen_schedule
from app.perception.bridging_mep import MepTakeoffClient, bridge_mep_point
from app.perception.bridging_tanah import TanahTakeoffClient, bridge_galian_footplat
from app.perception.consolidated_models import ConsolidatedExtraction, ElementRegistryEntry
from app.perception.consolidate import _normalize_kode
from paax_schemas.tkg_taxonomy import kategori_dari_kode
from paax_schemas.tkg_taxonomy import known_tkg_categories as _shared_known_tkg_categories
from paax_schemas.wbs import normalize_section, section_title


FormulaStatus = Literal["dihitung", "belum_didukung", "perlu_review"]

_MEP_CATEGORIES = {"mep", "sanitasi", "drainase", "plumbing", "listrik"}
_ARCHITECTURE_CATEGORIES = {"dinding", "lantai", "plafon", "atap", "finishing", "kusen"}
_EARTHWORK_CATEGORIES = {"tanah", "galian", "urugan"}
_SUPPORTED_TKG_WORK_TYPES = {"beton", "bekisting", "besi"}


class WbsSectionRef(BaseModel):
    code: str
    title: str


class TakeoffItemForWorkItem(BaseModel):
    kode: str
    lantai: Optional[str] = None
    kategori: str
    work_type: str
    quantity: Optional[float] = None
    unit: str
    formula: str
    detail: str
    needs_review: bool = False
    review_reason: Optional[str] = None
    mutu_beton: Optional[str] = None
    alamat: Optional[str] = None
    rule_id: str
    usage_factor: int = 1


class DrawingWorkItem(BaseModel):
    work_id: str
    kode: str
    kode_asli: list[str] = Field(default_factory=list)
    kategori: str
    work_type: Optional[str] = None
    uraian: str
    wbs_section: str
    wbs_title: str
    formula_status: FormulaStatus
    unit: Optional[str] = None
    volume: Optional[float] = None
    formula: Optional[str] = None
    rule_id: Optional[str] = None
    source_pages: list[int] = Field(default_factory=list)
    element_refs: list[str] = Field(default_factory=list)
    needs_review: bool = False
    review_reason: Optional[str] = None


class DrawingWorkItemsResult(BaseModel):
    work_items: list[DrawingWorkItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class WorkItemsRequest(BaseModel):
    consolidated: ConsolidatedExtraction
    takeoff_items: list[TakeoffItemForWorkItem] = Field(default_factory=list)


@lru_cache(maxsize=1)
def known_tkg_categories() -> set[str]:
    return _shared_known_tkg_categories()


def section_for_category(category: str | None) -> WbsSectionRef:
    normalized = (category or "").strip().lower()
    if normalized in known_tkg_categories():
        code = normalize_section("Struktur")
    elif normalized in _MEP_CATEGORIES:
        code = normalize_section("MEP")
    elif normalized in _ARCHITECTURE_CATEGORIES:
        code = normalize_section("Arsitektur / Finishing")
    elif normalized in _EARTHWORK_CATEGORIES:
        code = normalize_section("Tanah")
    else:
        code = normalize_section(None)
    return WbsSectionRef(code=code, title=section_title(code))


def _source_pages(entry: ElementRegistryEntry) -> list[int]:
    pages = {instance.sheet_page for instance in entry.instances}
    if entry.definisi is not None and entry.definisi.sumber_halaman is not None:
        pages.add(entry.definisi.sumber_halaman)
    return sorted(pages)


def _element_refs(entry: ElementRegistryEntry) -> list[str]:
    refs: list[str] = []
    for instance in entry.instances:
        if instance.alamat and instance.alamat not in refs:
            refs.append(instance.alamat)
    return refs


def _entry_category(entry: ElementRegistryEntry, item: TakeoffItemForWorkItem | None = None) -> str:
    return (entry.kategori or (item.kategori if item else "") or kategori_dari_kode(entry.kode) or "lain").strip()


def _has_supported_formula(category: str, work_type: str | None = None) -> bool:
    normalized = category.strip().lower()
    if normalized not in known_tkg_categories():
        return False
    return work_type is None or work_type in _SUPPORTED_TKG_WORK_TYPES


def _item_label(kode: str, category: str, work_type: str | None) -> str:
    category_label = category.replace("_", " ").strip() or "item"
    if work_type:
        return f"{work_type.capitalize()} {category_label} {kode}"
    return f"Item {category_label} {kode}"


def _from_takeoff(entry: ElementRegistryEntry, item: TakeoffItemForWorkItem, index: int) -> DrawingWorkItem:
    category = _entry_category(entry, item)
    section = section_for_category(category)
    status: FormulaStatus = "perlu_review" if item.needs_review or item.quantity is None else "dihitung"
    return DrawingWorkItem(
        work_id=f"{entry.kode}:{item.work_type}:{index}",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=category,
        work_type=item.work_type,
        uraian=_item_label(entry.kode, category, item.work_type),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=item.unit if status == "dihitung" else None,
        volume=item.quantity if status == "dihitung" else None,
        formula=item.formula,
        rule_id=item.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=item.review_reason if status == "perlu_review" else None,
    )


def _bridged_pondasi_telapak_item(
    entry: ElementRegistryEntry,
    tanah_client: TanahTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = bridge_galian_footplat(entry, tanah_client=tanah_client)
    section = section_for_category("galian")
    status: FormulaStatus = bridge.formula_status
    return DrawingWorkItem(
        work_id=f"{entry.kode}:galian_footplat:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type="galian_footplat",
        uraian=_item_label(entry.kode, "galian footplat", "galian"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


def _bridged_dinding_item(
    entry: ElementRegistryEntry,
    dinding_client: DindingTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = bridge_dinding_pasangan(entry, dinding_client=dinding_client)
    section = section_for_category("dinding")
    status: FormulaStatus = bridge.formula_status
    return DrawingWorkItem(
        work_id=f"{entry.kode}:pasangan_dinding:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type="pasangan_dinding",
        uraian=_item_label(entry.kode, "pasangan dinding", "pasangan"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


def _bridged_kusen_item(
    entry: ElementRegistryEntry,
    kusen_client: KusenTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = bridge_kusen_schedule(entry, kusen_client=kusen_client)
    section = section_for_category("kusen")
    status: FormulaStatus = bridge.formula_status
    tipe = entry.ai_kusen_suggestion.tipe if entry.ai_kusen_suggestion else entry.kode
    return DrawingWorkItem(
        work_id=f"{entry.kode}:kusen_schedule:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type="kusen_schedule",
        uraian=_item_label(entry.kode, f"kusen {tipe}", "kusen"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


def _bridged_mep_item(
    entry: ElementRegistryEntry,
    mep_client: MepTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = bridge_mep_point(entry, mep_client=mep_client)
    section = section_for_category("mep")
    status: FormulaStatus = bridge.formula_status
    jenis = entry.ai_mep_suggestion.jenis if entry.ai_mep_suggestion else entry.kode
    return DrawingWorkItem(
        work_id=f"{entry.kode}:mep_point:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type="mep_point",
        uraian=_item_label(entry.kode, f"titik {jenis}", "mep"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


_ROOF_FRAME_BRIDGE_FN = {
    "gording": bridge_gording,
    "trekstang": bridge_trekstang,
    "ikatan_angin": bridge_ikatan_angin,
}
_ROOF_FRAME_WORK_TYPE = {
    "gording": "rangka_gording",
    "trekstang": "rangka_trekstang",
    "ikatan_angin": "rangka_ikatan_angin",
}


def _bridged_roof_frame_item(
    entry: ElementRegistryEntry,
    kategori: str,
    atap_client: AtapTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = _ROOF_FRAME_BRIDGE_FN[kategori](entry, atap_client=atap_client)
    work_type = _ROOF_FRAME_WORK_TYPE[kategori]
    section = section_for_category(kategori)
    status: FormulaStatus = bridge.formula_status
    return DrawingWorkItem(
        work_id=f"{entry.kode}:{work_type}:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type=work_type,
        uraian=_item_label(entry.kode, kategori, "rangka"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


def _bridged_kuda_kuda_item(
    entry: ElementRegistryEntry,
    baja_client: BajaTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = bridge_kuda_kuda(entry, baja_client=baja_client)
    section = section_for_category("kuda_kuda")
    status: FormulaStatus = bridge.formula_status
    return DrawingWorkItem(
        work_id=f"{entry.kode}:rangka_kuda_kuda:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type="rangka_kuda_kuda",
        uraian=_item_label(entry.kode, "kuda kuda", "rangka"),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


_ARSITEKTUR_AREA_BRIDGE_FN = {
    "keramik_dinding": bridge_keramik_dinding,
    "plafon": bridge_plafon,
    "waterproofing": bridge_waterproofing,
}
_ARSITEKTUR_AREA_WORK_TYPE = {
    "keramik_dinding": "keramik_dinding",
    "plafon": "plafon",
    "waterproofing": "waterproofing",
}
_ARSITEKTUR_AREA_SECTION_CATEGORY = {
    "keramik_dinding": "finishing",
    "plafon": "plafon",
    "waterproofing": "finishing",
}


def _bridged_arsitektur_area_item(
    entry: ElementRegistryEntry,
    kategori: str,
    arsitektur_area_client: ArsitekturTakeoffClient | None,
) -> DrawingWorkItem:
    bridge = _ARSITEKTUR_AREA_BRIDGE_FN[kategori](entry, arsitektur_client=arsitektur_area_client)
    work_type = _ARSITEKTUR_AREA_WORK_TYPE[kategori]
    section = section_for_category(_ARSITEKTUR_AREA_SECTION_CATEGORY[kategori])
    status: FormulaStatus = bridge.formula_status
    return DrawingWorkItem(
        work_id=f"{entry.kode}:{work_type}:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=_entry_category(entry),
        work_type=work_type,
        uraian=_item_label(entry.kode, kategori, None),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        unit=bridge.unit if status == "dihitung" else None,
        volume=bridge.quantity if status == "dihitung" else None,
        formula=bridge.formula,
        rule_id=bridge.rule_id,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=status != "dihitung",
        review_reason=bridge.review_reason if status == "perlu_review" else None,
    )


def _fallback_item(
    entry: ElementRegistryEntry,
    tanah_client: TanahTakeoffClient | None = None,
    dinding_client: DindingTakeoffClient | None = None,
    atap_client: AtapTakeoffClient | None = None,
    baja_client: BajaTakeoffClient | None = None,
    arsitektur_area_client: ArsitekturTakeoffClient | None = None,
    kusen_client: KusenTakeoffClient | None = None,
    mep_client: MepTakeoffClient | None = None,
) -> DrawingWorkItem:
    category = _entry_category(entry)
    normalized_category = category.strip().lower()
    if normalized_category == "pondasi_telapak":
        return _bridged_pondasi_telapak_item(entry, tanah_client)
    if normalized_category == "dinding":
        return _bridged_dinding_item(entry, dinding_client)
    if normalized_category in _ROOF_FRAME_BRIDGE_FN:
        return _bridged_roof_frame_item(entry, normalized_category, atap_client)
    if normalized_category == "kuda_kuda":
        return _bridged_kuda_kuda_item(entry, baja_client)
    if normalized_category in _ARSITEKTUR_AREA_BRIDGE_FN:
        return _bridged_arsitektur_area_item(entry, normalized_category, arsitektur_area_client)
    if normalized_category == "kusen":
        return _bridged_kusen_item(entry, kusen_client)
    if normalized_category == "mep":
        return _bridged_mep_item(entry, mep_client)

    section = section_for_category(category)
    formula_supported = _has_supported_formula(category)
    status: FormulaStatus = "perlu_review" if formula_supported else "belum_didukung"
    reason = (
        "input takeoff belum lengkap untuk rumus yang tersedia"
        if status == "perlu_review"
        else "kategori belum memiliki rumus takeoff deterministik"
    )
    return DrawingWorkItem(
        work_id=f"{entry.kode}:manual:1",
        kode=entry.kode,
        kode_asli=entry.kode_asli or [entry.kode],
        kategori=category,
        work_type=None,
        uraian=_item_label(entry.kode, category, None),
        wbs_section=section.code,
        wbs_title=section.title,
        formula_status=status,
        source_pages=_source_pages(entry),
        element_refs=_element_refs(entry),
        needs_review=True,
        review_reason=reason,
    )


def build_work_items(
    consolidated: ConsolidatedExtraction,
    takeoff_items: list[TakeoffItemForWorkItem],
    tanah_client: TanahTakeoffClient | None = None,
    dinding_client: DindingTakeoffClient | None = None,
    atap_client: AtapTakeoffClient | None = None,
    baja_client: BajaTakeoffClient | None = None,
    arsitektur_area_client: ArsitekturTakeoffClient | None = None,
    kusen_client: KusenTakeoffClient | None = None,
    mep_client: MepTakeoffClient | None = None,
) -> DrawingWorkItemsResult:
    takeoff_by_code: dict[str, list[TakeoffItemForWorkItem]] = defaultdict(list)
    for item in takeoff_items:
        takeoff_by_code[_normalize_kode(item.kode)].append(item)

    work_items: list[DrawingWorkItem] = []
    for entry in consolidated.element_registry:
        matches = takeoff_by_code.get(_normalize_kode(entry.kode), [])
        if not matches:
            work_items.append(_fallback_item(
                entry, tanah_client=tanah_client, dinding_client=dinding_client,
                atap_client=atap_client, baja_client=baja_client,
                arsitektur_area_client=arsitektur_area_client,
                kusen_client=kusen_client, mep_client=mep_client,
            ))
            continue
        for index, item in enumerate(matches, start=1):
            work_items.append(_from_takeoff(entry, item, index))
    return DrawingWorkItemsResult(work_items=work_items)
