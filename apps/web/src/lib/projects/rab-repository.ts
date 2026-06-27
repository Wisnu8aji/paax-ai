'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LocalStorage, STORAGE_KEYS, projectStorageKey } from '@/lib/local-storage';
import { getDb, getProjectBackend } from './project-repository';

/**
 * Penyimpanan draft RAB per-proyek.
 *
 * ATURAN EMAS: yang disimpan di sini hanyalah INPUT terstruktur (kode AHSP,
 * volume, durasi, wilayah, PPN). TIDAK ada angka hasil yang dihitung frontend.
 * `lastTotal` hanyalah cache tampilan dari hasil engine (services/core-engine)
 * — selalu dihitung ulang oleh engine saat halaman dibuka, tidak pernah dikarang.
 */

export type ScheduleMode = 'sequential' | 'parallel';

export interface RabDraftLine {
  id: string;
  ahsp_code: string;
  volume: number | null;
  duration_days: number | null;
}

export interface ProjectRabDraft {
  projectId: string;
  regionCode: string;
  ppnRate: number;
  mode: ScheduleMode;
  lines: RabDraftLine[];
  /** Cache tampilan dari engine (RABResult.total). Bukan hasil hitung frontend. */
  lastTotal: number | null;
  lastCalculatedAt: string | null;
  updatedAt: string;
}

const COLLECTION = 'rab_drafts';

export function emptyRabLine(): RabDraftLine {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, ahsp_code: '', volume: null, duration_days: null };
}

export function emptyRabDraft(projectId: string, regionCode = 'jateng'): ProjectRabDraft {
  return {
    projectId,
    regionCode,
    ppnRate: 0.11,
    mode: 'sequential',
    lines: [emptyRabLine()],
    lastTotal: null,
    lastCalculatedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDraft(projectId: string, raw: Partial<ProjectRabDraft> | null): ProjectRabDraft {
  if (!raw) return emptyRabDraft(projectId);
  const lines = Array.isArray(raw.lines) && raw.lines.length
    ? raw.lines.map((line) => ({
        id: line?.id ?? emptyRabLine().id,
        ahsp_code: line?.ahsp_code ?? '',
        volume: typeof line?.volume === 'number' ? line.volume : null,
        duration_days: typeof line?.duration_days === 'number' ? line.duration_days : null,
      }))
    : [emptyRabLine()];
  return {
    projectId,
    regionCode: raw.regionCode || 'jateng',
    ppnRate: typeof raw.ppnRate === 'number' ? raw.ppnRate : 0.11,
    mode: raw.mode === 'parallel' ? 'parallel' : 'sequential',
    lines,
    lastTotal: typeof raw.lastTotal === 'number' ? raw.lastTotal : null,
    lastCalculatedAt: raw.lastCalculatedAt ?? null,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function localKey(projectId: string): string {
  return projectStorageKey(STORAGE_KEYS.RAB_DATA, projectId);
}

export const rabRepository = {
  async get(projectId: string): Promise<ProjectRabDraft> {
    if (getProjectBackend() === 'localStorage') {
      return normalizeDraft(projectId, LocalStorage.get<Partial<ProjectRabDraft> | null>(localKey(projectId), null));
    }
    const snapshot = await getDoc(doc(getDb(), COLLECTION, projectId));
    return normalizeDraft(projectId, snapshot.exists() ? (snapshot.data() as Partial<ProjectRabDraft>) : null);
  },

  async save(draft: ProjectRabDraft): Promise<ProjectRabDraft> {
    const next: ProjectRabDraft = { ...draft, updatedAt: new Date().toISOString() };
    if (getProjectBackend() === 'localStorage') {
      LocalStorage.set(localKey(draft.projectId), next);
      return next;
    }
    await setDoc(doc(getDb(), COLLECTION, draft.projectId), next);
    return next;
  },
};
