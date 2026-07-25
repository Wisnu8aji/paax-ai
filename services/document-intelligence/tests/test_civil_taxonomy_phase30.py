from app.drawing_intelligence.civil_taxonomy import canonical_discipline, canonical_element, canonical_level
from app.drawing_intelligence.hybrid_classifier import classify

def test_indonesian_taxonomy_is_canonical():
    assert canonical_discipline("Arsitektur") == "ARC"
    assert canonical_discipline("plumbing") == "MEP"
    assert canonical_element("Kolom Praktis KP") == "practical_column"
    assert canonical_level("LT. 2") == "L2"
    assert canonical_level("Denah Atap") == "ROOF"

def test_hybrid_classifier_abstains_without_evidence_or_on_conflict():
    decision=classify(ai_discipline="struktur", ai_element="kolom", ai_level="Lantai 2", evidence_count=0, active_conflict=False, element_code="K2")
    assert decision.status == "review_required" and "no_evidence" in decision.reason_codes
    conflict=classify(ai_discipline="struktur", ai_element="kolom", ai_level="Lantai 2", evidence_count=3, active_conflict=True, element_code="K2")
    assert conflict.status == "review_required" and "active_conflict" in conflict.reason_codes

def test_verified_classification_gets_lbs_wbs():
    decision=classify(ai_discipline="Structural", ai_element="Column", ai_level="Level 2", evidence_count=3, active_conflict=False, element_code="K2")
    assert decision.status == "classified"
    assert decision.lbs_path == ("Bangunan Utama", "Lantai 2", "K2")
    assert "Kolom" in decision.wbs_group
