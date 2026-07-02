from __future__ import annotations

from typing import List
from pydantic import BaseModel


class ResourceCoverageLine(BaseModel):
    resource_code: str
    resource_name: str = ""
    unit: str = ""
    used_by_ahsp: List[str]
    has_price: bool
    region_code: str
    source: str = ""


class AhspCoverageLine(BaseModel):
    ahsp_code: str
    description: str
    unit: str
    component_count: int
    priced_component_count: int
    missing_resource_codes: List[str]


class DataCoverageResult(BaseModel):
    region_code: str
    ahsp_total: int
    ahsp_fully_priced: int
    resource_used_total: int
    resource_priced_total: int
    coverage_ratio: float
    missing_resources: List[ResourceCoverageLine]
    ahsp: List[AhspCoverageLine]
    warnings: List[str] = []
