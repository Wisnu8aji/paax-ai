'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LocalStorage, projectStorageKey } from '@/lib/local-storage';
import { getDb, getProjectBackend } from './project-repository';

export interface ProjectDrawingFile {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  dataUrl: string | null;
}

interface ProjectDrawingsRecord {
  projectId: string;
  files: ProjectDrawingFile[];
  updatedAt: string;
}

const COLLECTION = 'project_drawings';
const STORAGE_KEY = 'paax_project_drawings';
const MAX_DATA_URL_BYTES = 1_500_000;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `drawing-${crypto.randomUUID()}`;
  return `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localKey(projectId: string): string {
  return projectStorageKey(STORAGE_KEY, projectId);
}

function normalize(projectId: string, raw: Partial<ProjectDrawingsRecord> | null): ProjectDrawingsRecord {
  return {
    projectId,
    files: Array.isArray(raw?.files)
      ? raw.files
          .filter((file): file is ProjectDrawingFile => Boolean(file?.id && file?.projectId && file?.name))
          .map((file) => ({ ...file, dataUrl: file.dataUrl ?? null }))
      : [],
    updatedAt: raw?.updatedAt ?? new Date().toISOString(),
  };
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  if (file.size > MAX_DATA_URL_BYTES || typeof FileReader === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const drawingsRepository = {
  async list(projectId: string): Promise<ProjectDrawingFile[]> {
    if (getProjectBackend() === 'localStorage') {
      return normalize(projectId, LocalStorage.get<Partial<ProjectDrawingsRecord> | null>(localKey(projectId), null)).files;
    }
    const snapshot = await getDoc(doc(getDb(), COLLECTION, projectId));
    return normalize(projectId, snapshot.exists() ? (snapshot.data() as Partial<ProjectDrawingsRecord>) : null).files;
  },

  async addFiles(projectId: string, files: File[]): Promise<ProjectDrawingFile[]> {
    const current = await this.list(projectId);
    const now = new Date().toISOString();
    const nextFiles = await Promise.all(
      files.map(async (file) => ({
        id: newId(),
        projectId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        uploadedAt: now,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    const record: ProjectDrawingsRecord = {
      projectId,
      files: [...nextFiles, ...current],
      updatedAt: now,
    };
    if (getProjectBackend() === 'localStorage') {
      LocalStorage.set(localKey(projectId), record);
      return record.files;
    }
    await setDoc(doc(getDb(), COLLECTION, projectId), record);
    return record.files;
  },
};
