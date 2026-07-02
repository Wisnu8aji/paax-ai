'use client';

/**
 * PAAX — Panel Triage Review (Task 9).
 *
 * Item takeoff berstatus `needs_review` dari core-engine di-triage manusia:
 *   1. SETOR DATA  — isi parameter yang kurang -> "Hitung Ulang" (engine
 *      menghitung ulang; UI tidak pernah menghitung — Aturan Emas).
 *   2. ABAIKAN     — tandai won't-fix dgn alasan; dicatat ke engine
 *      (/review/corrections) sebagai jejak audit + persist lokal.
 *   3. TERSELESAIKAN — otomatis terdeteksi saat recompute: item yang tadinya
 *      review dan kini hilang ditandai selesai (bukti = hasil engine baru).
 *
 * Komponen ini murni presentasi + orkestrasi; TIDAK ADA aritmetika kuantitas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, RotateCcw, ShieldQuestion, Undo2,
} from 'lucide-react';

import { logReviewCorrection } from '@/lib/engine';
import { currentUser } from '@/lib/mock/workspace';

export interface TriageItemView {
  /** kunci stabil lintas-recompute: kode.work.rule_id */
  key: string;
  kode: string;
  work: string;
  rule_id: string;
  reason: string;
}

type Disposition = { status: 'dismissed'; reason: string; at: string };
type Store = Record<string, Disposition>;

const storageKey = (projectId: string) => `paax-triage:${projectId}`;

function loadStore(projectId: string): Store {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* ignore */ }
  return {};
}

const S = {
  chip: {
    fontSize: 10, fontWeight: 700 as const, letterSpacing: 0.4,
    padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase' as const,
  },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
    fontSize: 11.5, fontWeight: 600 as const, padding: '5px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)',
    transition: 'background .15s, color .15s',
  },
};

export function TriagePanel({
  projectId,
  items,
  onRecompute,
  busy,
}: {
  projectId: string;
  items: TriageItemView[];
  /** minta parent memanggil ulang engine (takeoff) — angka selalu dari engine */
  onRecompute?: () => void;
  busy?: boolean;
}) {
  const [store, setStore] = useState<Store>({});
  const [resolvedKeys, setResolvedKeys] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const prevOpenKeys = useRef<Set<string> | null>(null);

  useEffect(() => { setStore(loadStore(projectId)); }, [projectId]);

  // Deteksi "terselesaikan": kunci yang tadinya open & kini tak lagi butuh review.
  useEffect(() => {
    const current = new Set(items.map((i) => i.key));
    if (prevOpenKeys.current) {
      const solved = [...prevOpenKeys.current].filter((k) => !current.has(k));
      if (solved.length) {
        setResolvedKeys((old) => [...new Set([...old, ...solved])]);
        setNote(`${solved.length} item review terselesaikan oleh hitung-ulang engine.`);
      }
    }
    prevOpenKeys.current = current;
  }, [items]);

  const persist = useCallback((next: Store) => {
    setStore(next);
    try { window.localStorage.setItem(storageKey(projectId), JSON.stringify(next)); } catch { /* ignore */ }
  }, [projectId]);

  const dismiss = useCallback(async (item: TriageItemView) => {
    const reason = window.prompt(
      `Abaikan review "${item.kode} · ${item.work}"?\nTulis alasan (wajib — masuk jejak audit):`);
    if (!reason?.trim()) return;
    persist({ ...store, [item.key]: { status: 'dismissed', reason: reason.trim(), at: new Date().toISOString() } });
    try {
      await logReviewCorrection({
        project_id: projectId, target_ref: item.key, field: 'triage_status',
        old: 'open', new: 'dismissed', reason: reason.trim(), user: currentUser.name,
      });
      setNote(`Disposisi "${item.kode}" tercatat di jejak audit engine.`);
    } catch {
      setNote('Disposisi tersimpan lokal — engine offline, jejak audit menyusul saat online.');
    }
  }, [projectId, store, persist]);

  const reopen = useCallback((item: TriageItemView) => {
    const next = { ...store };
    delete next[item.key];
    persist(next);
  }, [store, persist]);

  const { open, dismissed } = useMemo(() => {
    const open: TriageItemView[] = [];
    const dismissed: TriageItemView[] = [];
    for (const it of items) (store[it.key] ? dismissed : open).push(it);
    return { open, dismissed };
  }, [items, store]);

  if (!items.length && !resolvedKeys.length) return null;

  return (
    <div
      style={{
        border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
        background: 'var(--glass-bg, var(--surface))', backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', borderBottom: '1px solid var(--border-soft, var(--border))' }}>
        <ShieldQuestion size={15} color="var(--warn-fg, darkorange)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Triage Review</span>
        <span style={{ ...S.chip, background: 'var(--warn-bg, rgba(200,140,0,.12))', color: 'var(--warn-fg, darkorange)', border: '1px solid var(--warn-bd, transparent)' }}>
          {open.length} terbuka
        </span>
        {dismissed.length > 0 && (
          <span style={{ ...S.chip, background: 'color-mix(in srgb, var(--text) 7%, transparent)', color: 'var(--text2)' }}>
            {dismissed.length} diabaikan
          </span>
        )}
        {resolvedKeys.length > 0 && (
          <span style={{ ...S.chip, background: 'var(--ok-bg, rgba(0,150,80,.1))', color: 'var(--ok-fg, seagreen)' }}>
            {resolvedKeys.length} selesai
          </span>
        )}
        <div style={{ flex: 1 }} />
        {onRecompute && (
          <button style={S.btn} className="pax-btn-secondary" onClick={onRecompute} disabled={busy}>
            <RotateCcw size={13} /> {busy ? 'Menghitung…' : 'Hitung Ulang (engine)'}
          </button>
        )}
      </div>

      {note && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', fontSize: 11.5, color: 'var(--ok-fg, seagreen)', background: 'var(--ok-bg, rgba(0,150,80,.06))' }}>
          <CheckCircle2 size={13} /> {note}
        </div>
      )}

      {open.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {open.map((it) => (
            <li
              key={it.key}
              className="pax-row-hover"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-soft, var(--border))' }}
            >
              <AlertTriangle size={14} color="var(--warn-fg, darkorange)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="pax-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{it.kode}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{it.work}</span>
                  <span className="pax-mono" style={{ fontSize: 10, color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 5, padding: '0 5px' }}>{it.rule_id}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 }}>{it.reason}</div>
              </div>
              <button style={S.btn} onClick={() => void dismiss(it)} title="Tandai won't-fix dengan alasan (tercatat)">
                Abaikan
              </button>
            </li>
          ))}
        </ul>
      )}

      {dismissed.length > 0 && (
        <details style={{ padding: '8px 14px' }}>
          <summary style={{ fontSize: 11.5, color: 'var(--text3)', cursor: 'pointer' }}>
            Diabaikan ({dismissed.length}) — alasan tercatat
          </summary>
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
            {dismissed.map((it) => (
              <li key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 11.5, color: 'var(--text3)' }}>
                <span className="pax-mono" style={{ fontWeight: 700 }}>{it.kode}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {store[it.key]?.reason}
                </span>
                <button style={{ ...S.btn, padding: '3px 8px' }} onClick={() => reopen(it)}>
                  <Undo2 size={12} /> Buka lagi
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
