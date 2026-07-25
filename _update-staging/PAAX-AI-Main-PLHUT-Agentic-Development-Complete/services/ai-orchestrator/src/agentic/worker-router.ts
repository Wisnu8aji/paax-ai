export interface SpecialistWorker {
  workerId: string;
  disciplines: string[];
  capabilities: string[];
  riskLimit: 'low' | 'medium' | 'high' | 'critical';
  requiredTools: string[];
}

const RISK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

export class SpecialistWorkerRouter {
  constructor(private readonly workers: SpecialistWorker[]) {}

  select(discipline: string, capabilities: string[], risk: keyof typeof RISK): SpecialistWorker[] {
    return this.workers
      .filter((worker) => (worker.disciplines.includes(discipline) || worker.disciplines.includes('*'))
        && RISK[worker.riskLimit] >= RISK[risk]
        && capabilities.some((capability) => worker.capabilities.includes(capability)))
      .sort((a, b) => {
        const aCoverage = capabilities.filter((x) => a.capabilities.includes(x)).length;
        const bCoverage = capabilities.filter((x) => b.capabilities.includes(x)).length;
        return bCoverage - aCoverage || a.workerId.localeCompare(b.workerId);
      });
  }
}

export function defaultSpecialistWorkers(): SpecialistWorker[] {
  return [
    { workerId: 'evidence-agent', disciplines: ['*'], capabilities: ['evidence', 'source', 'conflict'], riskLimit: 'critical', requiredTools: ['query_graph', 'open_source'] },
    { workerId: 'drawing-agent', disciplines: ['architecture', 'structure', 'mep', 'civil'], capabilities: ['drawing', 'classification', 'instances'], riskLimit: 'high', requiredTools: ['analyze_zones', 'resolve_instances'] },
    { workerId: 'structural-agent', disciplines: ['structure', 'bridge'], capabilities: ['quantity', 'structural_check'], riskLimit: 'critical', requiredTools: ['run_core_formula', 'structural_solver'] },
    { workerId: 'quantity-agent', disciplines: ['*'], capabilities: ['quantity', 'takeoff'], riskLimit: 'high', requiredTools: ['get_measurement_facts', 'run_core_formula'] },
    { workerId: 'cost-agent', disciplines: ['*'], capabilities: ['cost', 'rab', 'ahsp'], riskLimit: 'high', requiredTools: ['lookup_ahsp', 'prepare_rab_mapping'] },
    { workerId: 'schedule-agent', disciplines: ['*'], capabilities: ['schedule', 'planning'], riskLimit: 'high', requiredTools: ['schedule_solver'] },
    { workerId: 'geotechnical-agent', disciplines: ['geotechnical'], capabilities: ['soil', 'foundation'], riskLimit: 'critical', requiredTools: ['geotech_solver'] },
    { workerId: 'safety-agent', disciplines: ['construction'], capabilities: ['safety', 'jsa', 'smkk'], riskLimit: 'critical', requiredTools: ['policy_check', 'draft_jsa'] },
    { workerId: 'checker-agent', disciplines: ['*'], capabilities: ['verify', 'claim_check'], riskLimit: 'critical', requiredTools: ['verify_claim_evidence'] },
  ];
}
