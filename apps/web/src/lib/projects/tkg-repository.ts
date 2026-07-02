'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { TkgDocument } from '@paax/schemas';
import { LocalStorage, projectStorageKey } from '@/lib/local-storage';
import { getDb, getProjectBackend } from './project-repository';

/**
 * Penyimpanan TKG (Transkrip Kanonik Gambar) per-proyek.
 *
 * TKG = "skrip" hasil pemecahan gambar kerja (brain TXT00): grid, bentang,
 * level, tabel tipe, elemen terpasang beralamat as. Ini SATU-SATUNYA pintu
 * fakta gambar untuk RAB/BoQ/Schedule/Chat (INV-TKG-01) — sistem lain membaca
 * TKG ini, bukan mengekstrak ulang gambar.
 *
 * ATURAN EMAS: yang tersimpan hanyalah TRANSKRIP terstruktur (fakta gambar).
 * Kuantitas/harga TIDAK disimpan di sini — dihitung engine via /tkg/takeoff.
 */

export interface ProjectTkgRecord {
  projectId: string;
  tkg: TkgDocument | null;
  /** "manual" | "ai_proposal" — usulan AI wajib direview sebelum dipakai. */
  source: string;
  reviewed: boolean;
  /** Cache render .tkg.txt terakhir dari engine (tampilan; bukan hasil hitung FE). */
  lastRenderedText: string | null;
  updatedAt: string;
}

const COLLECTION = 'tkg_documents';
const STORAGE_KEY = 'paax_tkg_data';

export function emptyTkgRecord(projectId: string): ProjectTkgRecord {
  return {
    projectId,
    tkg: null,
    source: 'manual',
    reviewed: false,
    lastRenderedText: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalize(projectId: string, raw: Partial<ProjectTkgRecord> | null): ProjectTkgRecord {
  if (!raw) return emptyTkgRecord(projectId);
  return {
    projectId,
    tkg: raw.tkg ?? null,
    source: raw.source ?? 'manual',
    reviewed: Boolean(raw.reviewed),
    lastRenderedText: raw.lastRenderedText ?? null,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function localKey(projectId: string): string {
  return projectStorageKey(STORAGE_KEY, projectId);
}

export const tkgRepository = {
  async get(projectId: string): Promise<ProjectTkgRecord> {
    if (getProjectBackend() === 'localStorage') {
      return normalize(projectId, LocalStorage.get<Partial<ProjectTkgRecord> | null>(localKey(projectId), null));
    }
    const snapshot = await getDoc(doc(getDb(), COLLECTION, projectId));
    return normalize(projectId, snapshot.exists() ? (snapshot.data() as Partial<ProjectTkgRecord>) : null);
  },

  async save(record: ProjectTkgRecord): Promise<ProjectTkgRecord> {
    const next: ProjectTkgRecord = { ...record, updatedAt: new Date().toISOString() };
    if (getProjectBackend() === 'localStorage') {
      LocalStorage.set(localKey(record.projectId), next);
      return next;
    }
    await setDoc(doc(getDb(), COLLECTION, record.projectId), next);
    return next;
  },
};
