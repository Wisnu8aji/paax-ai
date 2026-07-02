from __future__ import annotations

from typing import Iterable

from .models import ElementSeed, WorkItem, WorkItemsResult


def _wid(prj_id: str, divisi: str, work_type: str, seq: int) -> str:
    return f"{prj_id}.{divisi}.{work_type}.{seq:03d}"


def _work(prj_id: str, seq: int, divisi: str, work_type: str, uraian: str, unit: str,
          rule_id: str, element_id: str, rationale: str, needs_review: bool = False) -> WorkItem:
    return WorkItem(
        work_id=_wid(prj_id, divisi, work_type, seq),
        divisi=divisi,
        work_type=work_type,
        uraian_kanonik=uraian,
        satuan=unit,
        rule_id=rule_id,
        rationale=rationale,
        element_refs=[element_id],
        needs_review=needs_review,
    )


def expand_elements(elements: Iterable[ElementSeed], prj_id: str) -> WorkItemsResult:
    items: list[WorkItem] = []
    seq = 1
    for el in elements:
        if el.kind == "beton":
            for divisi, work_type, unit in [
                ("D3", "beton", "m3"),
                ("D4", "pembesian", "kg"),
                ("D5", "bekisting", "m2"),
            ]:
                items.append(_work(prj_id, seq, divisi, work_type, f"{work_type} {el.code}", unit,
                                   "RULE-EXP-BETON", el.element_id,
                                   "Elemen beton cor di tempat mekar menjadi beton, pembesian, bekisting."))
                seq += 1
        elif el.kind == "dinding":
            for work_type, unit in [
                ("pasangan_dinding", "m2"),
                ("plesteran", "m2"),
                ("acian", "m2"),
                ("pengecatan", "m2"),
            ]:
                items.append(_work(prj_id, seq, "D6" if work_type != "pengecatan" else "D12",
                                   work_type, f"{work_type} {el.code}", unit, "RULE-EXP-DINDING",
                                   el.element_id, "Rantai dinding: pasangan -> plester -> acian -> cat."))
                seq += 1
        elif el.kind == "lantai":
            for work_type, divisi in [("penutup_lantai", "D9"), ("plin", "D9")]:
                items.append(_work(prj_id, seq, divisi, work_type, f"{work_type} {el.code}", "m2",
                                   "RULE-EXP-LANTAI", el.element_id, "Rantai lantai deterministik."))
                seq += 1
        elif el.kind == "atap":
            for work_type in ["rangka_atap", "penutup_atap", "nok", "lisplank", "talang"]:
                items.append(_work(prj_id, seq, "D7", work_type, f"{work_type} {el.code}", "m",
                                   "RULE-EXP-ATAP", el.element_id, "Rantai atap deterministik."))
                seq += 1
    return WorkItemsResult(workitems=items)
