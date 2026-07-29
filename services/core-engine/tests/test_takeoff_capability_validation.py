from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.takeoff.models import (
    ArsitekturRequest,
    AtapMiring,
    DindingBidang,
    DindingRequest,
    GalianFootplat,
    TanahRequest,
)
from app.takeoff.params import ArsitekturParams, DindingParams, TanahParams
from app.tkg.params import TakeoffParams


def test_core_engine_takeoff_request_contract_validation():
    # Valid GalianFootplat
    valid_footplat = GalianFootplat(
        kode="FP1",
        b_ft=1.0,
        l_ft=1.0,
        d_gali=1.5,
        n=4,
    )
    assert valid_footplat.kode == "FP1"

    # Missing required field 'd_gali' raises ValidationError
    with pytest.raises(ValidationError):
        GalianFootplat(kode="FP1", b_ft=1.0, l_ft=1.0)  # type: ignore

    # ArsitekturParams forbids extra fields
    with pytest.raises(ValidationError):
        ArsitekturParams(h_pasang_keramik=1.5, extra_invalid_field=100.0)  # type: ignore


def test_tkg_params_waste_mode_validation():
    # AP-16: waste_mode='bbs' + waste_besi > 0 must raise ValidationError
    with pytest.raises(ValidationError) as exc_info:
        TakeoffParams(waste_mode="bbs", waste_besi=0.05, l_stock_m=12.0)

    assert "AP-16" in str(exc_info.value)
