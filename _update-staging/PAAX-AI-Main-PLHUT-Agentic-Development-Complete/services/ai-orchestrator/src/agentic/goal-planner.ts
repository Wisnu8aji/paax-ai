import type { AgentPlan, AgentTask, ProjectContextBinding } from './types';
import { validateProjectBinding } from './project-binding';

function task(id: string, title: string, capability: string, dependencies: string[] = [], requiresApproval = false): AgentTask {
  return { id, title, capability, dependencies, requiresApproval, status: dependencies.length ? 'pending' : 'ready' };
}

export function buildEngineeringPlan(goal: string, binding: ProjectContextBinding): AgentPlan {
  const normalized = goal.trim();
  if (!normalized) throw new Error('goal is required');
  const safeBinding = validateProjectBinding(binding);
  const lower = normalized.toLowerCase();
  const tasks: AgentTask[] = [task('scope','Kunci proyek, snapshot, revisi, dan disiplin','resolve_project_scope')];
  tasks.push(task('evidence','Ambil evidence lintas lembar yang relevan','query_construction_graph',['scope']));
  if (/jumlah|volume|quantity|kuant|hitung/.test(lower)) {
    tasks.push(task('instances','Rekonstruksi instance fisik dan authority jumlah','resolve_physical_instances',['evidence']));
    tasks.push(task('facts','Validasi Measurement Facts dan konflik','validate_measurement_facts',['instances']));
    tasks.push(task('calculate','Jalankan formula deterministik Core Engine','run_core_formula',['facts']));
  }
  if (/rab|ahsp|biaya|cost/.test(lower)) tasks.push(task('cost','Siapkan mapping RAB/AHSP sebagai draft','prepare_rab_mapping',[tasks.at(-1)?.id ?? 'evidence'],true));
  tasks.push(task('verify','Validasi claim, unit, source, revision, dan abstention','verify_claim_evidence',[tasks.at(-1)?.id ?? 'evidence']));
  tasks.push(task('respond','Susun jawaban engineering dengan sumber dan status','compose_engineering_response',['verify']));
  return { planId:`plan-${crypto.randomUUID()}`, version:1, goal:normalized, binding:safeBinding, tasks,
    stopConditions:['goal_completed','insufficient_evidence','human_approval_required','tool_failure_limit','budget_exhausted'] };
}
