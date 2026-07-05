from __future__ import annotations

import importlib.util
import sys
import types
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.perception.consolidated_models import ConsolidatedExtraction, ElementRegistryEntry
from app.perception.consolidate import _normalize_kode


FormulaStatus = Literal["dihitung", "belum_didukung", "perlu_review"]

_STRUCTURAL_CATEGORIES = {
    "kolom", "kolom_praktis", "sloof", "balok", "ring_balok", "latei",
    "plat", "pondasi_telapak", "dinding_beton", "tangga",
}
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
def _core_sections_module():
    """Load langsung module core-engine agar WBS_SECTIONS/normalize_section
    tetap satu sumber, tanpa membuat taksonomi WBS paralel di service ini."""
    rab_dir = Path(__file__).resolve().parents[3] / "core-engine" / "app" / "rab"
    package_name = "_paax_core_engine_rab_for_document_intelligence"
    if package_name not in sys.modules:
        package = types.ModuleType(package_name)
        package.__path__ = [str(rab_dir)]  # type: ignore[attr-defined]
        sys.modules[package_name] = package

    module_name = f"{package_name}.sections"
    if module_name in sys.modules:
        return sys.modules[module_name]

    spec = importlib.util.spec_from_file_location(module_name, rab_dir / "sections.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("Tidak bisa memuat core-engine app/rab/sections.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _wbs_title(code: str) -> str:
    sections = dict(_core_sections_module().WBS_SECTIONS)
    return sections.get(code, "Lainnya")


def section_for_category(category: str | None) -> WbsSectionRef:
    normalized = (category or "").strip().lower()
    if normalized in _STRUCTURAL_CATEGORIES:
        code = _core_sections_module().normalize_section("Struktur")
    elif normalized in _MEP_CATEGORIES:
        code = _core_sections_module().normalize_section("MEP")
    elif normalized in _ARCHITECTURE_CATEGORIES:
        code = _core_sections_module().normalize_section("Arsitektur / Finishing")
    elif normalized in _EARTHWORK_CATEGORIES:
        code = _core_sections_module().normalize_section("Tanah")
    else:
        code = _core_sections_module().normalize_section(None)
    return WbsSectionRef(code=code, title=_wbs_title(code))


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
    return (entry.kategori or (item.kategori if item else "") or "lain").strip()


def _has_supported_formula(category: str, work_type: str | None = None) -> bool:
    normalized = category.strip().lower()
    if normalized not in _STRUCTURAL_CATEGORIES:
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


def _fallback_item(entry: ElementRegistryEntry) -> DrawingWorkItem:
    category = _entry_category(entry)
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
) -> DrawingWorkItemsResult:
    takeoff_by_code: dict[str, list[TakeoffItemForWorkItem]] = defaultdict(list)
    for item in takeoff_items:
        takeoff_by_code[_normalize_kode(item.kode)].append(item)

    work_items: list[DrawingWorkItem] = []
    for entry in consolidated.element_registry:
        matches = takeoff_by_code.get(_normalize_kode(entry.kode), [])
        if not matches:
            work_items.append(_fallback_item(entry))
            continue
        for index, item in enumerate(matches, start=1):
            work_items.append(_from_takeoff(entry, item, index))
    return DrawingWorkItemsResult(work_items=work_items)
