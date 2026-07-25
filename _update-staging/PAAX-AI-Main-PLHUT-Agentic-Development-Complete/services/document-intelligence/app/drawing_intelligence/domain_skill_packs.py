from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RiskTier = Literal["low", "medium", "high", "critical"]


class EngineeringSkill(BaseModel):
    skill_id: str
    name: str
    discipline: str
    description: str
    required_tools: list[str]
    required_inputs: list[str]
    outputs: list[str]
    approval_roles: list[str]
    risk_tier: RiskTier
    deterministic_engines: list[str] = Field(default_factory=list)


class SkillPack(BaseModel):
    pack_id: str
    discipline: str
    skills: list[EngineeringSkill]


def default_skill_packs() -> list[SkillPack]:
    data = {
        "structure": [
            ("audit-column", "Audit kolom lintas lembar", ["query_graph", "resolve_instances", "run_core_formula"], ["column_plan", "column_schedule", "levels"], ["quantity_report", "conflict_register"], ["structural_engineer"], "high", ["core_engine"]),
            ("beam-quantity", "Kuantifikasi balok", ["query_graph", "trace_topology", "run_core_formula"], ["beam_plan", "beam_schedule"], ["beam_quantity"], ["structural_engineer", "qs"], "high", ["core_engine"]),
        ],
        "architecture": [
            ("finish-takeoff", "Takeoff pekerjaan finishing", ["zone_measure", "deduct_openings"], ["finish_plan", "room_schedule"], ["net_area", "skirting_length"], ["architect", "qs"], "medium", ["takeoff_engine"]),
        ],
        "mep": [
            ("mep-topology", "Audit topology MEP", ["trace_network", "cross_reference"], ["plan", "legend", "riser"], ["network_report", "coordination_issues"], ["mep_engineer"], "high", ["topology_engine"]),
        ],
        "cost": [
            ("rab-ahsp", "Susun draft RAB/AHSP", ["get_verified_facts", "lookup_ahsp", "prepare_rab_mapping"], ["verified_quantities", "ahsp_catalog"], ["rab_draft", "lineage_report"], ["qs", "project_manager"], "high", ["formula_registry", "cost_engine"]),
        ],
        "schedule": [
            ("quantity-schedule", "Susun jadwal berbasis kuantitas", ["get_verified_facts", "lookup_productivity", "schedule_solver"], ["verified_quantities", "productivity_rates"], ["wbs_schedule", "critical_path"], ["planner", "project_manager"], "high", ["schedule_engine"]),
        ],
        "geotechnical": [
            ("foundation-screening", "Screening fondasi", ["read_borelogs", "soil_profile", "geotech_solver"], ["bore_logs", "loads"], ["foundation_options", "missing_data"], ["geotechnical_engineer"], "critical", ["geotech_solver"]),
        ],
        "infrastructure": [
            ("road-drainage", "Audit jalan dan drainase", ["resolve_chainage", "trace_network", "hydraulic_solver"], ["alignment", "cross_sections", "drainage_plan"], ["quantity", "capacity_checks"], ["civil_engineer"], "critical", ["gis_engine", "hydraulic_solver"]),
            ("bridge-audit", "Audit komponen jembatan", ["query_graph", "resolve_instances", "structural_solver"], ["general_arrangement", "bearing_schedule", "sections"], ["component_register", "risk_report"], ["bridge_engineer"], "critical", ["structural_solver"]),
        ],
        "quality_safety": [
            ("concrete-qc", "Review hasil uji beton", ["read_test_results", "policy_check", "draft_ncr"], ["test_results", "pour_register", "specification"], ["acceptance_report", "ncr_draft"], ["qa_qc_manager"], "critical", ["statistics_engine"]),
            ("jsa", "Susun draft JSA/SMKK", ["hazard_library", "policy_check", "draft_jsa"], ["method_statement", "site_context"], ["jsa_draft", "hazard_register"], ["hse_manager"], "critical", ["risk_matrix_engine"]),
        ],
        "contract": [
            ("rfi", "Buat RFI berbasis evidence", ["get_conflict", "open_source", "draft_rfi"], ["conflict", "source_documents"], ["rfi_draft", "entity_links"], ["project_manager"], "high", []),
        ],
        "bim_asset": [
            ("bim-coordinate", "Koordinasi BIM/VDC", ["open_ifc", "clash_engine", "link_drawing_model"], ["ifc", "drawings"], ["clash_register", "element_links"], ["bim_manager"], "high", ["ifc_engine"]),
            ("asset-inspection", "Prioritas pemeliharaan aset", ["read_inspections", "condition_scoring", "lifecycle_cost"], ["asset_register", "inspection_history"], ["maintenance_plan"], ["asset_manager"], "high", ["condition_engine"]),
        ],
    }
    packs: list[SkillPack] = []
    for discipline, rows in data.items():
        skills = [EngineeringSkill(
            skill_id=row[0], name=row[1], discipline=discipline, description=row[1], required_tools=row[2],
            required_inputs=row[3], outputs=row[4], approval_roles=row[5], risk_tier=row[6], deterministic_engines=row[7],
        ) for row in rows]
        packs.append(SkillPack(pack_id=f"pack-{discipline}", discipline=discipline, skills=skills))
    return packs
