from __future__ import annotations

from .models import QaIssue, QaRequest, QaResult


def _issue(code: str, message: str, objek_ref: str | None = None) -> QaIssue:
    return QaIssue(code=code, message=message, objek_ref=objek_ref)


def run_qa(req: QaRequest) -> QaResult:
    issues: list[QaIssue] = []

    if req.weights_pct:
        total = sum(req.weights_pct)
        if abs(total - 100.0) > req.tol_bobot:
            issues.append(_issue("F-K01", f"Σ bobot = {total:.4f}% di luar toleransi {req.tol_bobot}%."))

    if req.price_coverage_ratio is not None and req.price_coverage_ratio < 1.0:
        issues.append(_issue("F-K02", "Cakupan harga belum 100%."))

    if req.work_ids and len(set(req.work_ids)) != len(req.work_ids):
        issues.append(_issue("F-K04", "work_id duplikat."))

    for pair in req.unit_pairs:
        if pair.get("work_unit") != pair.get("ahsp_unit"):
            issues.append(_issue("F-K05", "Satuan WorkItem tidak sama dengan satuan AHSP.", pair.get("objek_ref")))

    revisions = [rev for rev in req.revision_ids if rev]
    if len(set(revisions)) > 1:
        issues.append(_issue("F-K06", "Evidence mencampur lebih dari satu revisi."))

    for check in req.sanity_checks:
        ref = check.get("objek_ref")
        if "value" in check and check["value"] < 0:
            issues.append(_issue("F-K07", "Kuantitas negatif dilarang.", ref))
        if "a_kotor" in check and "a_neto" in check and check["a_neto"] > check["a_kotor"]:
            issues.append(_issue("F-K07", "A_neto lebih besar dari A_kotor.", ref))
        if "v_uk" in check and "v_gali" in check and check["v_uk"] > check["v_gali"]:
            issues.append(_issue("F-K07", "V_uk lebih besar dari V_gali.", ref))

    if not req.boe_exists:
        issues.append(_issue("F-K08", "BOE belum terbit."))

    return QaResult(passed=not issues, issues=issues)
