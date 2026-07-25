import type { ProjectContextBinding } from './types';

export interface CivilEngineeringSkill {
  skillId: string;
  name: string;
  discipline: string;
  requiredInputs: string[];
  tasks: Array<{ taskId: string; tool: string; dependencies: string[]; approvalRole?: string }>;
  outputs: string[];
  failureModes: string[];
}

export class CivilEngineeringSkillRegistry {
  private readonly skills = new Map<string, CivilEngineeringSkill>();
  register(skill: CivilEngineeringSkill): void {
    if (this.skills.has(skill.skillId)) throw new Error(`duplicate skill: ${skill.skillId}`);
    const ids = new Set(skill.tasks.map((t) => t.taskId));
    for (const task of skill.tasks) for (const dep of task.dependencies) if (!ids.has(dep)) throw new Error(`unknown dependency ${dep} in ${skill.skillId}`);
    this.skills.set(skill.skillId, skill);
  }
  get(skillId: string): CivilEngineeringSkill { const value = this.skills.get(skillId); if (!value) throw new Error(`skill not found: ${skillId}`); return value; }
  list(discipline?: string): CivilEngineeringSkill[] { return [...this.skills.values()].filter((s) => !discipline || s.discipline === discipline); }
  instantiate(skillId: string, binding: ProjectContextBinding): { skill: CivilEngineeringSkill; binding: ProjectContextBinding } { return { skill: this.get(skillId), binding }; }
}

export function createDefaultSkillRegistry(): CivilEngineeringSkillRegistry {
  const registry = new CivilEngineeringSkillRegistry();
  registry.register({
    skillId: 'quantify-concrete-columns', name: 'Kuantifikasi Kolom Beton', discipline: 'structure',
    requiredInputs: ['column_plan', 'column_schedule', 'level_elevations'],
    tasks: [
      { taskId: 'find-sources', tool: 'query_construction_graph', dependencies: [] },
      { taskId: 'instances', tool: 'resolve_physical_instances', dependencies: ['find-sources'] },
      { taskId: 'facts', tool: 'authorize_measurement_facts', dependencies: ['instances'], approvalRole: 'structural_engineer' },
      { taskId: 'calculate', tool: 'run_core_formula', dependencies: ['facts'] },
      { taskId: 'report', tool: 'export_quantity_report', dependencies: ['calculate'] },
    ], outputs: ['column_quantity_report', 'evidence_register'],
    failureModes: ['missing_schedule', 'missing_height', 'active_conflict', 'unverified_count'],
  });
  registry.register({
    skillId: 'draft-rfi-from-conflict', name: 'RFI dari Konflik Gambar', discipline: 'construction',
    requiredInputs: ['active_conflict', 'source_documents'],
    tasks: [
      { taskId: 'inspect', tool: 'get_conflict', dependencies: [] },
      { taskId: 'sources', tool: 'open_source_sheet', dependencies: ['inspect'] },
      { taskId: 'draft', tool: 'draft_rfi', dependencies: ['sources'] },
      { taskId: 'submit', tool: 'submit_rfi', dependencies: ['draft'], approvalRole: 'project_manager' },
    ], outputs: ['rfi_draft', 'entity_links'], failureModes: ['conflict_resolved', 'source_unavailable'],
  });
  return registry;
}
