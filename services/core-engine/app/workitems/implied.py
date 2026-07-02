from __future__ import annotations

from .models import ImpliedRequest, WorkItem, WorkItemsResult


def _work(prj_id: str, seq: int, divisi: str, work_type: str, rule_id: str, rationale: str) -> WorkItem:
    return WorkItem(
        work_id=f"{prj_id}.{divisi}.{work_type}.{seq:03d}",
        divisi=divisi,
        work_type=work_type,
        uraian_kanonik=work_type.replace("_", " "),
        satuan="review",
        asal="implied",
        rule_id=rule_id,
        rationale=rationale,
        needs_review=True,
    )


def implied_workitems(req: ImpliedRequest) -> WorkItemsResult:
    items: list[WorkItem] = []
    seq = 1
    if req.government_project:
        items.append(_work(req.prj_id, seq, "D0", "smkk", "RULE-IMP-SMKK",
                           "Proyek pemerintah wajib menelusuri item SMKK/K3."))
        seq += 1
    items.append(_work(req.prj_id, seq, "D1", "persiapan", "RULE-IMP-PERSIAPAN",
                       "Persiapan proyek wajib dicek walau tidak tergambar."))
    seq += 1
    if req.concrete_pour_volume_m3 is not None and req.concrete_pour_volume_m3 > req.V_pompa_min:
        items.append(_work(req.prj_id, seq, "D3", "sewa_pompa_beton", "RULE-IMP-METODE",
                           "Volume cor melewati ambang V_pompa_min."))
    return WorkItemsResult(workitems=items)
