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
