import type { AgentPlan, AgentRun, AgentTask } from './types';

function assertRunMutable(run: AgentRun): void {
  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    throw new Error(`agent run is terminal: ${run.status}`);
  }
}

export function nextReadyTask(run: AgentRun): AgentTask | null {
  if (run.currentTaskId || ['waiting_approval', 'completed', 'failed', 'cancelled'].includes(run.status)) return null;
  const done = new Set(run.completedTaskIds);
  return run.plan.tasks.find((task) =>
    !done.has(task.id)
    && task.status !== 'failed'
    && task.status !== 'blocked'
    && task.dependencies.every((id) => done.has(id))
  ) ?? null;
}

export function startTask(run: AgentRun, taskId: string): AgentRun {
  assertRunMutable(run);
  if (run.currentTaskId) throw new Error(`another task is already active: ${run.currentTaskId}`);
  const task = run.plan.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`unknown task: ${taskId}`);
  if (run.completedTaskIds.includes(taskId)) throw new Error(`task already completed: ${taskId}`);
  if (task.status === 'failed' || task.status === 'blocked') throw new Error(`task cannot be started: ${taskId}`);
  if (!task.dependencies.every((id) => run.completedTaskIds.includes(id))) throw new Error(`task dependencies are incomplete: ${taskId}`);
  if (task.requiresApproval) return { ...run, status: 'waiting_approval', currentTaskId: taskId };
  return { ...run, status: 'running', currentTaskId: taskId };
}

export function approveTask(run: AgentRun, taskId: string): AgentRun {
  if (run.status !== 'waiting_approval' || run.currentTaskId !== taskId) {
    throw new Error(`task is not waiting for approval: ${taskId}`);
  }
  return { ...run, status: 'running' };
}

export function completeTask(run: AgentRun, taskId: string): AgentRun {
  if (run.currentTaskId !== taskId) throw new Error(`task is not active: ${taskId}`);
  if (run.status === 'waiting_approval') throw new Error(`task approval is still pending: ${taskId}`);
  if (run.status !== 'running') throw new Error(`run is not executing: ${run.status}`);
  const completed = [...new Set([...run.completedTaskIds, taskId])];
  const allDone = run.plan.tasks.every((task) => completed.includes(task.id));
  return { ...run, completedTaskIds: completed, currentTaskId: undefined, status: allDone ? 'completed' : 'running' };
}

export function replanRun(run: AgentRun, nextPlan: AgentPlan): AgentRun {
  assertRunMutable(run);
  if (run.currentTaskId) throw new Error('cannot replan while a task is active');
  if (nextPlan.binding.projectId !== run.plan.binding.projectId || nextPlan.binding.conversationId !== run.plan.binding.conversationId) {
    throw new Error('replan cannot change project or conversation binding');
  }
  if (nextPlan.version <= run.plan.version) throw new Error('replan version must increase');
  const nextIds = new Set(nextPlan.tasks.map((task) => task.id));
  const completedTaskIds = run.completedTaskIds.filter((id) => nextIds.has(id));
  return { ...run, plan: nextPlan, completedTaskIds, status: 'planned', failure: undefined };
}

export function failRun(run: AgentRun, failure: string): AgentRun {
  if (!failure.trim()) throw new Error('failure reason is required');
  return { ...run, status: 'failed', currentTaskId: undefined, failure };
}

export function cancelRun(run: AgentRun, reason = 'cancelled by user'): AgentRun {
  assertRunMutable(run);
  return { ...run, status: 'cancelled', currentTaskId: undefined, failure: reason };
}
