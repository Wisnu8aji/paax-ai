import { type Project, type ProjectCreateInput, type ProjectUpdateInput, compareProjects } from './types';

// Lewat proxy server /api/db-projects (bukan langsung ke services/db) -- services/db
// mewajibkan otentikasi (X-Internal-Key server-to-server atau token Firebase asli),
// yang tidak pernah tersedia dari fetch sisi-browser. Proxy menyuntik X-Internal-Key
// di server, kunci tidak pernah terekspos ke browser (pola sama dgn core-engine/
// drawing-intelligence proxy).
const API_BASE = '/api/db-projects';

/**
 * Normalizes snake_case backend keys to camelCase for the frontend Project type.
 */
function normalizeBackendProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name,
    location: raw.location || '',
    client: raw.client || 'Belum diisi',
    type: raw.type || 'Gedung',
    status: raw.status || 'active',
    description: raw.description || 'Proyek tersimpan.',
    rabValue: typeof raw.rab_value === 'number' ? raw.rab_value : null,
    progress: typeof raw.progress === 'number' ? raw.progress : 0,
    warnings: typeof raw.warnings === 'number' ? raw.warnings : 0,
    health: typeof raw.health === 'number' ? raw.health : 100,
    lastActivity: raw.last_activity || 'tersimpan',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * Formats camelCase frontend data to snake_case backend keys.
 */
function formatFrontendProject(input: Partial<ProjectCreateInput & ProjectUpdateInput> & { id?: string }): any {
  return {
    id: input.id,
    name: input.name,
    location: input.location,
    client: input.client,
    type: input.type,
    status: input.status,
    description: input.description,
    rab_value: input.rabValue,
  };
}

export const dbApiRepository = {
  async list(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(normalizeBackendProject).sort(compareProjects);
  },

  async get(id: string): Promise<Project | null> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeBackendProject(data);
  },

  async create(input: ProjectCreateInput & { id: string }): Promise<Project> {
    const payload = formatFrontendProject(input);
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error('Failed to create project in backend');
    }
    const data = await res.json();
    return normalizeBackendProject(data);
  },

  async update(id: string, input: ProjectUpdateInput): Promise<Project | null> {
    const payload = formatFrontendProject(input);
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeBackendProject(data);
  },
};

export const dbApiRabRepository = {
  async get(projectId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/rab`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.payload;
  },

  async save(projectId: string, data: any): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/rab`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: data }),
    });
    if (!res.ok) throw new Error('Failed to save RAB payload');
  },
};

export const dbApiTkgRepository = {
  async get(projectId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tkg`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.payload;
  },

  async save(projectId: string, data: any): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tkg`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: data }),
    });
    if (!res.ok) throw new Error('Failed to save TKG payload');
  },
};
