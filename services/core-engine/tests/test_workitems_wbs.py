from __future__ import annotations

from app.workitems.completeness import check_wbs_completeness
from app.workitems.expand import expand_elements
from app.workitems.implied import implied_workitems
from app.workitems.models import ElementSeed, ImpliedRequest, WbsCompletenessRequest
from app.workitems.wbs import WBS_MASTER


def test_wbs_master_d0_d15_lengkap():
    assert [d.code for d in WBS_MASTER][0] == "D0"
    assert [d.code for d in WBS_MASTER][-1] == "D15"
    assert len(WBS_MASTER) == 16


def test_wbs_completeness_missing_divisions_anchor():
    result = check_wbs_completeness(WbsCompletenessRequest(existing_divisions=["D2", "D3", "D4"]))

    assert "D2" in result.present_divisions
    assert "D0" in result.missing_relevant
    assert "D15" in result.missing_relevant
    assert len(result.missing_relevant) == 13


def test_expand_beton_dan_dinding_anchor():
    result = expand_elements(
        [
            ElementSeed(element_id="E-K1", kind="beton", code="K1"),
            ElementSeed(element_id="E-D1", kind="dinding", code="D1", length_m=7, height_m=3),
        ],
        prj_id="PRJ",
    )

    works = {(w.element_refs[0], w.work_type) for w in result.workitems}
    assert ("E-K1", "beton") in works
    assert ("E-K1", "pembesian") in works
    assert ("E-K1", "bekisting") in works
    assert ("E-D1", "pasangan_dinding") in works
    assert ("E-D1", "plesteran") in works
    assert ("E-D1", "acian") in works
    assert ("E-D1", "pengecatan") in works


def test_implied_smkk_dan_pompa_needs_review():
    result = implied_workitems(
        ImpliedRequest(
            prj_id="PRJ",
            government_project=True,
            concrete_pour_volume_m3=35,
            V_pompa_min=30,
        )
    )

    types = {w.work_type: w for w in result.workitems}
    assert types["smkk"].needs_review is True
    assert types["sewa_pompa_beton"].needs_review is True
    assert types["sewa_pompa_beton"].rule_id == "RULE-IMP-METODE"
