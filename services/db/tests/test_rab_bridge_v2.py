from paax_db.rab_bridge_v2 import build_candidate_set


def test_verified_concrete_element_expands_to_multiple_nonfinal_work_item_candidates():
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="COLUMN-1", verified_physical=True, discipline="structure",
        element_category="column", material="concrete", method="cast_in_place", wbs="II", region_code="jateng",
        description="kolom beton bertulang", evidence_refs=["EV-1"],
        measurement_facts=[
            {"measurement_id": "V", "measurement_type": "volume_input", "unit": "m3", "verification_status": "engine_verified"},
            {"measurement_id": "A", "measurement_type": "area", "unit": "m2", "verification_status": "human_verified"},
            {"measurement_id": "M", "measurement_type": "mass_input", "unit": "kg", "verification_status": "human_verified"},
            {"measurement_id": "C", "measurement_type": "count", "unit": "unit", "verification_status": "human_verified"},
        ],
        catalog=[
            {"code": "BETON-M3", "description": "pengecoran kolom beton bertulang", "unit": "m3", "discipline": "structure", "category": "beton", "material": "concrete", "method": "cast_in_place", "wbs": "II", "regions": ["jateng"]},
            {"code": "BETON-M2", "description": "pengecoran kolom beton", "unit": "m2", "discipline": "structure", "category": "beton", "regions": ["jateng"]},
        ],
        human_history=[{"ahsp_code": "BETON-M3", "discipline": "structure", "category": "beton", "region_code": "jateng", "selections": 3}],
    )
    assert [work.work_type for work in result.work_items] == ["beton", "bekisting", "pembesian", "curing", "support"]
    concrete = result.work_items[0]
    assert concrete.status == "candidate_ready" and concrete.ahsp_candidates[0].ahsp_code == "BETON-M3"
    assert concrete.ahsp_candidates[0].is_final is False
    assert [item.model_dump() for item in concrete.rejected_candidates] == [{"ahsp_code": "BETON-M2", "reason": "incompatible_unit:m2!=m3"}]
    assert result.provenance["evidence_refs"] == ["EV-1"]


def test_unverified_or_incompatible_measurements_never_generate_calculation_ready_work_items():
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="COLUMN-2", verified_physical=True, discipline="structure",
        element_category="column", material="concrete", method="cast_in_place", wbs="II", region_code="jateng",
        description="kolom beton", evidence_refs=[],
        measurement_facts=[{"measurement_id": "BAD", "measurement_type": "volume_input", "unit": "m3", "verification_status": "candidate"}],
        catalog=[], human_history=[],
    )
    assert all(work.status == "needs_measurement" for work in result.work_items)
    assert all(not work.ahsp_candidates for work in result.work_items)


def test_contextual_or_unverified_element_is_rejected_before_candidate_generation():
    import pytest
    with pytest.raises(ValueError, match="verified physical"):
        build_candidate_set(project_id="P", snapshot_id="S", physical_element_id="CTX", verified_physical=False, discipline="structure", element_category="column", material="concrete", method="cast_in_place", wbs="II", region_code="jateng", description="contextual reference", evidence_refs=[], measurement_facts=[], catalog=[], human_history=[])


def test_non_concrete_architecture_element_gets_a_domain_specific_breakdown_not_a_generic_primary_item():
    """A prior audit found every non-concrete element collapsed to a single
    generic ('primary', element_category, 'unit', 'count') work item -- a
    masonry wall and a door both got the same uninformative breakdown."""
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="WALL-1", verified_physical=True,
        discipline="architecture", element_category="wall", material="masonry", method="pasangan_bata",
        wbs="III", region_code="jateng", description="pasangan dinding bata merah",
        evidence_refs=["EV-2"],
        measurement_facts=[
            {"measurement_id": "AREA-1", "measurement_type": "area", "unit": "m2", "verification_status": "human_verified"},
        ],
        catalog=[], human_history=[],
    )
    work_types = [work.work_type for work in result.work_items]
    assert work_types == ["pasangan", "plesteran", "acian", "finishing", "unit_terpasang"]
    assert "primary" not in work_types


def test_non_concrete_mep_element_gets_a_domain_specific_breakdown():
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="PIPE-1", verified_physical=True,
        discipline="mep", element_category="pipe", material="pvc", method="instalasi",
        wbs="IV", region_code="jateng", description="instalasi pipa air bersih",
        evidence_refs=["EV-3"], measurement_facts=[], catalog=[], human_history=[],
    )
    assert [work.work_type for work in result.work_items] == [
        "instalasi_pipa", "titik_instalasi", "peralatan_utama", "pengujian",
    ]


def test_unmapped_discipline_still_falls_back_to_a_generic_primary_item():
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="X-1", verified_physical=True,
        discipline="unknown_discipline", element_category="fixture", material="other", method="unspecified",
        wbs="V", region_code="jateng", description="unclassified element",
        evidence_refs=[], measurement_facts=[], catalog=[], human_history=[],
    )
    assert [work.work_type for work in result.work_items] == ["primary"]


def test_candidate_below_minimum_score_becomes_no_candidate_instead_of_a_weak_ranked_suggestion():
    """A prior audit found candidate ranking had no hard minimum semantic
    threshold: a catalog item with almost no overlap to the queried element
    could still surface as the top (only) ranked suggestion."""
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="WALL-2", verified_physical=True,
        discipline="architecture", element_category="wall", material="masonry", method="pasangan_bata",
        wbs="III", region_code="jateng", description="pasangan dinding bata merah",
        evidence_refs=[],
        measurement_facts=[
            {"measurement_id": "AREA-2", "measurement_type": "area", "unit": "m2", "verification_status": "human_verified"},
        ],
        catalog=[
            {"code": "UNRELATED-M2", "description": "pekerjaan tidak terkait sama sekali", "unit": "m2", "regions": []},
        ],
        human_history=[],
    )
    pasangan = next(work for work in result.work_items if work.work_type == "pasangan")
    assert pasangan.status == "no_candidate"
    assert pasangan.ahsp_candidates == []
    assert pasangan.rejected_candidates[0].reason.startswith("below_minimum_score:")


def test_candidate_at_or_above_minimum_score_is_still_surfaced_as_candidate_ready():
    result = build_candidate_set(
        project_id="P-1", snapshot_id="S-1", physical_element_id="WALL-3", verified_physical=True,
        discipline="architecture", element_category="wall", material="masonry", method="pasangan_bata",
        wbs="III", region_code="jateng", description="pasangan dinding bata merah",
        evidence_refs=[],
        measurement_facts=[
            {"measurement_id": "AREA-3", "measurement_type": "area", "unit": "m2", "verification_status": "human_verified"},
        ],
        catalog=[
            {"code": "BATA-M2", "description": "pasangan dinding bata merah", "unit": "m2",
             "discipline": "architecture", "category": "pasangan", "regions": ["jateng"]},
        ],
        human_history=[],
    )
    pasangan = next(work for work in result.work_items if work.work_type == "pasangan")
    assert pasangan.status == "candidate_ready"
    assert pasangan.ahsp_candidates[0].ahsp_code == "BATA-M2"
