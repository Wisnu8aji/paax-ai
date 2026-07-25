from app.drawing_intelligence.domain_skill_packs import default_skill_packs


def test_domain_skill_packs_cover_civil_engineering_without_building_only_ontology():
    packs = default_skill_packs()
    disciplines = {p.discipline for p in packs}
    assert {"structure", "architecture", "mep", "cost", "schedule", "geotechnical", "infrastructure", "quality_safety", "contract", "bim_asset"}.issubset(disciplines)
    skills = [s for p in packs for s in p.skills]
    assert any(s.skill_id == "bridge-audit" and "structural_solver" in s.deterministic_engines for s in skills)
    assert any(s.skill_id == "jsa" and s.risk_tier == "critical" for s in skills)
    assert all(s.approval_roles for s in skills if s.risk_tier in {"high", "critical"})
