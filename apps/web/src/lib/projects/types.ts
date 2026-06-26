export type ProjectStatus = 'active' | 'review' | 'hold' | 'done';

export interface Project {
  id: string;
  name: string;
  location: string;
  client: string;
  type: string;
  status: ProjectStatus;
  description: string;
  rabValue: number | null;
  progress: number;
  warnings: number;
  health: number;
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateInput {
  name: string;
  location: string;
  client?: string;
  type: string;
  description?: string;
}

export type ProjectUpdateInput = Partial<ProjectCreateInput> & {
  status?: ProjectStatus;
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'AKTIF',
  review: 'REVIEW',
  hold: 'TERTUNDA',
  done: 'SELESAI',
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, 'ok' | 'warn' | 'dng' | 'neutral'> = {
  active: 'ok',
  review: 'warn',
  hold: 'neutral',
  done: 'ok',
};

export function createProjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createProjectFromInput(input: ProjectCreateInput): Project {
  const now = new Date().toISOString();
  return {
    id: createProjectId(),
    name: input.name.trim(),
    location: input.location.trim(),
    client: input.client?.trim() || 'Belum diisi',
    type: input.type.trim() || 'Gedung',
    status: 'active',
    description: input.description?.trim() || 'Proyek baru. Lengkapi deskripsi pekerjaan sebelum estimasi.',
    rabValue: null,
    progress: 0,
    warnings: 0,
    health: 100,
    lastActivity: 'baru dibuat',
    createdAt: now,
    updatedAt: now,
  };
}

export function compareProjects(a: Project, b: Project): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}
