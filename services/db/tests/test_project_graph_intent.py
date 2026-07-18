import pytest

from paax_db import models
from paax_db.project_graph_intent import parse_query_plan
from paax_db.project_graph_repository import build_and_activate_snapshot


async def _seed_vocabulary(
    session,
    *,
    project_id="PROJECT-INTENT",
    snapshot_id="SNAP-INTENT",
    extra_element_types=(),
):
    session.add(models.Project(id=project_id, owner_id="OWNER-A", name="Intent Project"))
    await session.commit()
    await build_and_activate_snapshot(
        session,
        project_id=project_id,
        snapshot_id=snapshot_id,
        schema_version="paax.pckm.graph.v1",
        source_manifest_hash="intent",
        generation_metadata={},
        nodes=[
            {
                "node_id": "L1",
                "node_type": "level",
                "canonical_name": "Lantai 1",
                "normalized_name": "lantai 1",
                "discipline": "general",
                "verification_status": "extracted",
                "confidence": 1,
            },
            {
                "node_id": "L2",
                "node_type": "level",
                "canonical_name": "Lantai 2",
                "normalized_name": "lantai 2",
                "discipline": "general",
                "verification_status": "extracted",
                "confidence": 1,
            },
            {
                "node_id": "TYPE-K1",
                "node_type": "element_type",
                "canonical_name": "K1",
                "normalized_name": "k1",
                "discipline": "structure",
                "verification_status": "extracted",
                "confidence": 1,
            },
            {
                "node_id": "TYPE-KOLOM",
                "node_type": "element_type",
                "canonical_name": "Kolom",
                "normalized_name": "kolom",
                "discipline": "structure",
                "verification_status": "extracted",
                "confidence": 1,
            },
            *[
                {
                    "node_id": node_id,
                    "node_type": "element_type",
                    "canonical_name": canonical_name,
                    "normalized_name": canonical_name.casefold(),
                    "discipline": "structure",
                    "verification_status": "extracted",
                    "confidence": 1,
                }
                for node_id, canonical_name in extra_element_types
            ],
        ],
        edges=[],
        evidence=[],
        node_evidence=[],
        edge_evidence=[],
        aliases=[
            {
                "alias_normalized": "k1",
                "alias_raw": "K1",
                "node_id": "TYPE-K1",
                "alias_type": "drawing_mark",
                "confidence": 1,
            },
            {
                "alias_normalized": "kolom struktur",
                "alias_raw": "Kolom Struktur",
                "node_id": "TYPE-KOLOM",
                "alias_type": "label",
                "confidence": 1,
            },
        ],
        communities=[],
    )


@pytest.mark.asyncio
async def test_rule_based_intent_parser_matches_manual_query_anchors():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_vocabulary(session)

        structure_plan, structure_notes = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="struktur lantai 2"
        )
        calculation_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="berapa volume beton lantai 2"
        )
        dimension_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="dimensi K1"
        )
        conflict_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="ada konflik apa di gambar"
        )
        unknown_level_plan, unknown_level_notes = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="Lantai 3 ada apa saja"
        )
        column_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="kolom lantai 1"
        )

    assert structure_plan.intent == "LIST_FILTER"
    assert structure_plan.filters == {"level": "Lantai 2", "discipline": "structure"}
    assert structure_plan.relations == [
        "INSTANCE_OF",
        "LOCATED_ON",
        "LOCATED_IN",
        "DEFINED_BY",
        "DEPICTED_IN",
        "HAS_DIMENSION",
        "USES_MATERIAL",
        "HAS_EVIDENCE",
    ]
    assert structure_notes == []

    assert calculation_plan.intent == "CALCULATION_REQUIRED"
    assert calculation_plan.relations == []

    assert dimension_plan.intent == "NUMERIC_STORED_FACT"
    assert [entity.model_dump() for entity in dimension_plan.entities] == [
        {"type": "element_type", "value": "K1"}
    ]

    assert conflict_plan.intent == "CONFLICT_LOOKUP"
    assert conflict_plan.relations == ["CONFLICTS_WITH", "HAS_EVIDENCE"]

    assert unknown_level_plan.intent == "LIST_FILTER"
    assert unknown_level_plan.filters["level"] is None
    assert any("level tak dikenal: Lantai 3" in note for note in unknown_level_notes)

    assert column_plan.intent == "ELEMENT_LOOKUP"
    assert column_plan.filters["level"] == "Lantai 1"
    assert [entity.model_dump() for entity in column_plan.entities] == [
        {"type": "element_type", "value": "Kolom"}
    ]


@pytest.mark.asyncio
async def test_query_plan_mirror_uses_zod_field_names_and_marks_unknown_terms():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_vocabulary(session)
        plan, notes = await parse_query_plan(
            session,
            project_id="PROJECT-INTENT",
            snapshot_id="SNAP-INTENT",
            query="struktur lantai 2 xyzzy",
        )

    assert set(plan.model_dump()) == {
        "intent",
        "project_id",
        "entities",
        "filters",
        "relations",
        "traversal_mode",
        "traversal_depth",
        "budget_tokens",
    }
    assert any("unrecognized_terms" in note and "xyzzy" in note for note in notes)


@pytest.mark.asyncio
async def test_material_words_require_a_calculation_signal_and_conflict_has_parser_precedence():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_vocabulary(session)
        material_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="material K1"
        )
        concrete_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="beton K1"
        )
        calculation_plan, _ = await parse_query_plan(
            session,
            project_id="PROJECT-INTENT",
            snapshot_id="SNAP-INTENT",
            query="berapa kebutuhan besi K1",
        )
        conflict_plan, _ = await parse_query_plan(
            session, project_id="PROJECT-INTENT", snapshot_id="SNAP-INTENT", query="konflik dimensi"
        )

    assert material_plan.intent == "ELEMENT_LOOKUP"
    assert [entity.value for entity in material_plan.entities] == ["K1"]
    assert concrete_plan.intent == "ELEMENT_LOOKUP"
    assert [entity.value for entity in concrete_plan.entities] == ["K1"]
    assert calculation_plan.intent == "CALCULATION_REQUIRED"
    assert conflict_plan.intent == "CONFLICT_LOOKUP"


@pytest.mark.asyncio
async def test_entity_token_overlap_matches_multiple_lintel_types_and_single_lintel_query():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_vocabulary(
            session,
            project_id="PROJECT-INTENT-LINTEL",
            snapshot_id="SNAP-INTENT-LINTEL",
            extra_element_types=(
                ("TYPE-LINTEL-15X10", "Lintel 15X10"),
                ("TYPE-BALOK-LINTEL", "BALOK LINTEL"),
            ),
        )
        natural_plan, natural_notes = await parse_query_plan(
            session,
            project_id="PROJECT-INTENT-LINTEL",
            snapshot_id="SNAP-INTENT-LINTEL",
            query="balok lintel di lantai mana saja",
        )
        single_plan, single_notes = await parse_query_plan(
            session,
            project_id="PROJECT-INTENT-LINTEL",
            snapshot_id="SNAP-INTENT-LINTEL",
            query="lintel",
        )

    expected_entities = {"Lintel 15X10", "BALOK LINTEL"}
    assert {entity.value for entity in natural_plan.entities} == expected_entities
    assert {entity.value for entity in single_plan.entities} == expected_entities
    assert all("balok" not in note and "lintel" not in note for note in natural_notes + single_notes)


@pytest.mark.asyncio
async def test_entity_token_overlap_leaves_generic_token_unrecognized_after_eight_types():
    from .conftest import TestSession

    async with TestSession() as session:
        await _seed_vocabulary(
            session,
            project_id="PROJECT-INTENT-GENERIC",
            snapshot_id="SNAP-INTENT-GENERIC",
            extra_element_types=[(f"TYPE-BALOK-{index}", f"Balok {index}") for index in range(9)],
        )
        plan, notes = await parse_query_plan(
            session,
            project_id="PROJECT-INTENT-GENERIC",
            snapshot_id="SNAP-INTENT-GENERIC",
            query="balok",
        )

    assert plan.entities == []
    assert any("unrecognized_terms" in note and "balok" in note for note in notes)
