'use client';

import { initializeApp, getApps } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import {
  compareProjects,
  createProjectFromInput,
  type ProjectStatus,
  type Project,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from './types';
import { dbApiRepository, dbApiWorkspaceRepository, type WorkspaceHead, type WorkspaceSession } from './db-api';

const COLLECTION = 'projects';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export type ProjectBackend = 'firestore' | 'localStorage' | 'postgres';

export function getProjectBackend(): ProjectBackend {
  if (process.env.NEXT_PUBLIC_USE_DB === 'true') {
    return 'postgres';
  }
  return Object.values(firebaseConfig).every(Boolean) ? 'firestore' : 'localStorage';
}

export function getDb() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getFirestore(app);
}

function normalizeProject(raw: Partial<Project> & { statusLabel?: string }): Project | null {
  if (!raw.id || !raw.name) return null;
  const now = new Date().toISOString();
  const status: ProjectStatus =
    raw.status === 'review' || raw.status === 'hold' || raw.status === 'done' ? raw.status : 'active';
  return {
    id: raw.id,
    name: raw.name,
    location: raw.location ?? '',
    client: raw.client ?? 'Belum diisi',
    type: raw.type ?? 'Gedung',
    status,
    description: raw.description ?? 'Proyek tersimpan.',
    rabValue: typeof raw.rabValue === 'number' ? raw.rabValue : null,
    progress: typeof raw.progress === 'number' ? raw.progress : 0,
    warnings: typeof raw.warnings === 'number' ? raw.warnings : 0,
    health: typeof raw.health === 'number' ? raw.health : 100,
    lastActivity: raw.lastActivity ?? 'tersimpan',
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    isReference: raw.isReference,
    isDefaultReference: raw.isDefaultReference,
  } as any;
}

function readLocalProjects(): Project[] {
  return LocalStorage.get<Array<Partial<Project>>>(STORAGE_KEYS.PROJECTS, [])
    .map((project) => normalizeProject(project))
    .filter((project): project is Project => Boolean(project))
    .sort(compareProjects);
}

function writeLocalProjects(projects: Project[]): void {
  LocalStorage.set(STORAGE_KEYS.PROJECTS, projects.sort(compareProjects));
}

async function listLocalProjects(): Promise<Project[]> {
  return readLocalProjects();
}

async function createLocalProject(input: ProjectCreateInput): Promise<Project> {
  const project = createProjectFromInput(input);
  writeLocalProjects([project, ...readLocalProjects()]);
  return project;
}

async function updateLocalProject(id: string, input: ProjectUpdateInput): Promise<Project | null> {
  const projects = readLocalProjects();
  const index = projects.findIndex((project) => project.id === id);
  if (index === -1) return null;
  const current = projects[index];
  const updated: Project = {
    ...current,
    ...input,
    name: input.name?.trim() || current.name,
    location: input.location?.trim() || current.location,
    client: input.client?.trim() || current.client,
    type: input.type?.trim() || current.type,
    description: input.description?.trim() || current.description,
    updatedAt: new Date().toISOString(),
    lastActivity: 'baru diperbarui',
  };
  projects[index] = updated;
  writeLocalProjects(projects);
  return updated;
}

async function deleteLocalProject(id: string): Promise<void> {
  writeLocalProjects(readLocalProjects().filter((project) => project.id !== id));
  if (LocalStorage.getActiveProjectId() === id) {
    LocalStorage.clearActiveProjectId();
  }
}

export const projectRepository = {
  backend: getProjectBackend,

  cachedList(): Project[] {
    return getProjectBackend() === 'localStorage' ? readLocalProjects() : [];
  },

  async getWorkspaceHead(): Promise<WorkspaceHead | null> {
    if (getProjectBackend() === 'postgres') {
      return dbApiWorkspaceRepository.getHead();
    }
    return null;
  },

  async patchWorkspaceHead(patch: Partial<WorkspaceHead>): Promise<WorkspaceHead | null> {
    if (getProjectBackend() === 'postgres') {
      return dbApiWorkspaceRepository.patchHead(patch);
    }
    return null;
  },

  async getWorkspaceSession(projectId: string): Promise<WorkspaceSession | null> {
    if (getProjectBackend() === 'postgres') {
      return dbApiWorkspaceRepository.getSession(projectId);
    }
    return null;
  },

  async patchWorkspaceSession(projectId: string, patch: Partial<WorkspaceSession>): Promise<WorkspaceSession | null> {
    if (getProjectBackend() === 'postgres') {
      return dbApiWorkspaceRepository.patchSession(projectId, patch);
    }
    return null;
  },

  async list(): Promise<Project[]> {
    const backend = getProjectBackend();
    if (backend === 'postgres') return dbApiRepository.list();
    if (backend === 'localStorage') return listLocalProjects();
    const snapshot = await getDocs(collection(getDb(), COLLECTION));
    return snapshot.docs
      .map((item) => normalizeProject(item.data() as Partial<Project>))
      .filter((project): project is Project => Boolean(project))
      .sort(compareProjects);
  },

  async get(id: string): Promise<Project | null> {
    const backend = getProjectBackend();
    if (backend === 'postgres') return dbApiRepository.get(id);
    if (backend === 'localStorage') {
      return readLocalProjects().find((project) => project.id === id) ?? null;
    }
    const snapshot = await getDoc(doc(getDb(), COLLECTION, id));
    return snapshot.exists() ? normalizeProject(snapshot.data() as Partial<Project>) : null;
  },

  async create(input: ProjectCreateInput): Promise<Project> {
    const backend = getProjectBackend();
    if (backend === 'postgres') {
      const project = createProjectFromInput(input);
      return dbApiRepository.create({ ...input, id: project.id });
    }
    if (backend === 'localStorage') return createLocalProject(input);
    const project = createProjectFromInput(input);
    await setDoc(doc(getDb(), COLLECTION, project.id), project);
    return project;
  },

  async update(id: string, input: ProjectUpdateInput): Promise<Project | null> {
    const backend = getProjectBackend();
    if (backend === 'postgres') return dbApiRepository.update(id, input);
    if (backend === 'localStorage') return updateLocalProject(id, input);
    const current = await this.get(id);
    if (!current) return null;
    const updated: Project = {
      ...current,
      ...input,
      name: input.name?.trim() || current.name,
      location: input.location?.trim() || current.location,
      client: input.client?.trim() || current.client,
      type: input.type?.trim() || current.type,
      description: input.description?.trim() || current.description,
      updatedAt: new Date().toISOString(),
      lastActivity: 'baru diperbarui',
    };
    await setDoc(doc(getDb(), COLLECTION, id), updated);
    return updated;
  },

  async delete(id: string): Promise<void> {
    if (getProjectBackend() === 'localStorage') return deleteLocalProject(id);
    await deleteDoc(doc(getDb(), COLLECTION, id));
  },
};
