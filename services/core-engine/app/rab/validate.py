"""
PAAX Core Engine — RAB Health Check (validasi deterministik, tanpa AI).

Memeriksa integritas RAB sebelum dipakai/tender. Semua aturan deterministik —
AI (nanti) hanya menambahkan justifikasi naratif, bukan menentukan lolos/tidak.

Aturan:
  - EMPTY                 : RAB tanpa item                              (error)
  - UNKNOWN_AHSP          : kode AHSP tak dikenal engine               (error)
  - NONPOSITIVE_VOLUME    : volume <= 0                                (error)
  - DUPLICATE_ITEM        : kode AHSP sama muncul > 1 kali             (warning)
  - WEIGHT_CONCENTRATION  : satu item > ambang % dari RAB              (warning)
  - MISSING_DURATION      : item tanpa durasi (jadwal belum siap)      (info)

Skor = 100 − 25/err − 10/warn − 3/info  (lantai 0).
"""
from __future__ import annotations
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel

from .models import AHSPItem, ResourcePrice, RABLineInput
from .rab import compute_rab

Severity = Literal["info", "warning", "error"]
_RANK = {"error": 0, "warning": 1, "info": 2}


class ValidationIssue(BaseModel):
    code: str
    severity: Severity
    message: str
    ahsp_code: Optional[str] = None


class ValidationResult(BaseModel):
    score: int
    ok: bool                # tidak ada error
    items_count: int
    errors: int
    warnings: int
    infos: int
    issues: List[ValidationIssue]


def validate_rab(
    lines: List[RABLineInput],
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
    region: str,
    region_code: str,
    ppn_rate: float = 0.11,
    weight_threshold: float = 60.0,
) -> ValidationResult:
    issues: List[ValidationIssue] = []

    if not lines:
        issues.append(ValidationIssue(code="EMPTY", severity="error",
                                      message="RAB belum berisi item pekerjaan."))

    seen: Dict[str, int] = {}
    for li in lines:
        seen[li.ahsp_code] = seen.get(li.ahsp_code, 0) + 1
        if li.ahsp_code not in ahsp_index:
            issues.append(ValidationIssue(code="UNKNOWN_AHSP", severity="error",
                ahsp_code=li.ahsp_code,
                message=f"Kode AHSP '{li.ahsp_code}' tidak dikenal engine."))
        if li.volume is None or li.volume <= 0:
            issues.append(ValidationIssue(code="NONPOSITIVE_VOLUME", severity="error",
                ahsp_code=li.ahsp_code,
                message=f"Volume item '{li.ahsp_code}' harus > 0."))
        if not li.duration_days or li.duration_days <= 0:
            issues.append(ValidationIssue(code="MISSING_DURATION", severity="info",
                ahsp_code=li.ahsp_code,
                message=f"Item '{li.ahsp_code}' belum punya durasi — jadwal/Kurva S belum bisa dibangun."))

    for code, n in seen.items():
        if n > 1 and code in ahsp_index:
            issues.append(ValidationIssue(code="DUPLICATE_ITEM", severity="warning",
                ahsp_code=code,
                message=f"Item '{code}' muncul {n}x — gabungkan agar volume tidak dobel."))

    # Cek konsentrasi bobot hanya bila tidak ada error pemblokir (RAB bisa dihitung).
    blocking = any(i.severity == "error" for i in issues)
    if not blocking and lines:
        rab = compute_rab(lines, ahsp_index, price_book, region=region,
                          region_code=region_code, ppn_rate=ppn_rate)
        for ln in rab.lines:
            if ln.weight_pct > weight_threshold:
                issues.append(ValidationIssue(code="WEIGHT_CONCENTRATION", severity="warning",
                    ahsp_code=ln.ahsp_code,
                    message=f"Item '{ln.ahsp_code}' = {ln.weight_pct:.1f}% dari RAB "
                            f"(> {weight_threshold:.0f}%). Pastikan volume & harga benar."))

    issues.sort(key=lambda i: (_RANK[i.severity], i.code, i.ahsp_code or ""))

    errors = sum(1 for i in issues if i.severity == "error")
    warnings = sum(1 for i in issues if i.severity == "warning")
    infos = sum(1 for i in issues if i.severity == "info")
    score = max(0, 100 - errors * 25 - warnings * 10 - infos * 3)

    return ValidationResult(
        score=score, ok=(errors == 0), items_count=len(lines),
        errors=errors, warnings=warnings, infos=infos, issues=issues,
    )
