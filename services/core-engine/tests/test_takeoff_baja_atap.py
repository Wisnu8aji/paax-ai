from __future__ import annotations

from app.takeoff.atap import takeoff_atap
from app.takeoff.baja import takeoff_baja
from app.takeoff.models import (
    AtapDetailRequest,
    BajaMember,
    BajaRequest,
    BuiltUpPlate,
    DownpipeArea,
    GordingInput,
    IkatanAngin,
    RoofLine,
)
from app.takeoff.params import BajaParams, AtapParams


def _item(result, kode, work):
    matches = [i for i in result.items if i.kode == kode and i.work == work]
    assert len(matches) == 1
    return matches[0]


def test_baja_profile_builtup_dan_cat_anchor():
    """Manual: WF_TEST 10 kg/m x 12 x 2 x 1.05 = 252 kg.
    Built-up: 7850*.01*.2*5 = 78.5 kg before waste, x1.05=82.425.
    Cat: perimeter .8 x 12 x 2 = 19.2 m2."""
    result = takeoff_baja(
        BajaRequest(
            profile_table={"WF_TEST": {"kg_per_m": 10, "perimeter_m": 0.8}},
            members=[BajaMember(kode="BM1", designation="WF_TEST", length_m=12, qty=2)],
            builtup_plates=[BuiltUpPlate(kode="PLT1", t_m=0.01, width_m=0.2, length_m=5)],
            paint_members=[BajaMember(kode="CAT1", designation="WF_TEST", length_m=12, qty=2)],
            params=BajaParams(W_baja_waste=0.05),
        )
    )

    assert _item(result, "BM1", "baja_profil").quantity == 252
    assert _item(result, "PLT1", "baja_builtup_plate").quantity == 82.425
    assert _item(result, "CAT1", "pengecatan_baja").quantity == 19.2


def test_baja_profile_tidak_ada_jadi_review():
    result = takeoff_baja(BajaRequest(members=[BajaMember(kode="BM2", designation="WF_MISSING", length_m=10)]))

    item = _item(result, "BM2", "baja_profil")
    assert item.needs_review is True
    assert item.quantity is None


def test_atap_detail_gording_ikatan_dan_downpipe_anchor():
    """Manual: gording floor(5/1.2)+1=5 rows; 5*10*2=100 m.
    Diagonal 3-4-5 x2 = 10 m. Downpipe ceil(115/50)=3."""
    result = takeoff_atap(
        AtapDetailRequest(
            garis=[
                RoofLine(kode="NOK1", work="nok", length_m=12),
                RoofLine(kode="LIS1", work="lisplank", length_m=30),
                RoofLine(kode="TAL1", work="talang", length_m=8),
            ],
            gording=[GordingInput(kode="G1", l_miring_sisi_m=5, s_gording_m=1.2, l_arah_gording_m=10, n_sisi_atap=2)],
            ikatan_angin=[IkatanAngin(kode="IA1", a_m=3, b_m=4, qty=2)],
            downpipes=[DownpipeArea(kode="DP1", a_atap_m2=115)],
            params=AtapParams(A_per_downpipe=50),
        )
    )

    assert _item(result, "NOK1", "nok").quantity == 12
    assert _item(result, "LIS1", "lisplank").quantity == 30
    assert _item(result, "TAL1", "talang").quantity == 8
    assert _item(result, "G1", "gording").quantity == 100
    assert _item(result, "IA1", "ikatan_angin").quantity == 10
    assert _item(result, "DP1", "pipa_hujan").quantity == 3
    assert any("A_per_downpipe" in a for a in result.assumptions)
