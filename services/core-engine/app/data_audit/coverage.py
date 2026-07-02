from __future__ import annotations

from collections import defaultdict
from typing import Dict

from app.rab.models import AHSPItem, ResourcePrice

from .models import AhspCoverageLine, DataCoverageResult, ResourceCoverageLine


def _r4(value: float) -> float:
    return round(value + 1e-12, 4)


def audit_data_coverage(
    ahsp_index: Dict[str, AHSPItem],
    price_book: Dict[str, ResourcePrice],
    region_code: str,
) -> DataCoverageResult:
    used_by: dict[str, list[str]] = defaultdict(list)
    ahsp_lines: list[AhspCoverageLine] = []
    fully_priced = 0

    for item in sorted(ahsp_index.values(), key=lambda x: x.code):
        component_codes = [comp.resource_code for comp in item.components]
        missing = [code for code in component_codes if code not in price_book]
        for code in component_codes:
            if item.code not in used_by[code]:
                used_by[code].append(item.code)
        if not missing:
            fully_priced += 1
        ahsp_lines.append(
            AhspCoverageLine(
                ahsp_code=item.code,
                description=item.name,
                unit=item.unit,
                component_count=len(component_codes),
                priced_component_count=len(component_codes) - len(missing),
                missing_resource_codes=sorted(set(missing)),
            )
        )

    missing_resources: list[ResourceCoverageLine] = []
    for code in sorted(used_by):
        if code in price_book:
            continue
        missing_resources.append(
            ResourceCoverageLine(
                resource_code=code,
                used_by_ahsp=sorted(used_by[code]),
                has_price=False,
                region_code=region_code,
            )
        )

    used_total = len(used_by)
    priced_total = sum(1 for code in used_by if code in price_book)
    warnings = []
    if missing_resources:
        warnings.append(
            f"{len(missing_resources)} resource dipakai AHSP tetapi belum punya harga wilayah {region_code}."
        )

    return DataCoverageResult(
        region_code=region_code,
        ahsp_total=len(ahsp_index),
        ahsp_fully_priced=fully_priced,
        resource_used_total=used_total,
        resource_priced_total=priced_total,
        coverage_ratio=_r4(priced_total / used_total) if used_total else 1.0,
        missing_resources=missing_resources,
        ahsp=ahsp_lines,
        warnings=warnings,
    )
