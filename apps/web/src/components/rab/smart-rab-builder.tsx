'use client';

/**
 * PAAX v0.8 — Smart RAB Builder (AI-first, mode fallback rule-based).
 *
 * Alur: teks elemen → /api/ai/extract (AI menstruktur: tipe + AHSP + seksi +
 * dimensi + confidence) → engine /geometry/volume menghitung volume tiap elemen
 * → engine /rab/build menyusun RAB tersektor. User memverifikasi/mengoreksi
 * (Togal-style) lalu menerapkan ke editor untuk edit manual.
 *
 * ATURAN EMAS: AI hanya mengusulkan struktur; SEMUA angka (volume, biaya) dari
 * engine. Tidak ada perhitungan di frontend.
 */
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Trash2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import type { VolumeResult, SectionedRABResult } from '@paax/schemas';
import { Modal, Button, StatusPill } from '@/components/ui';
import { computeVolume, buildSectionedRAB, type AHSPListItem } from '@/lib/engine';
import type { ExtractedElement } from '@/lib/ai/rab-extractor';
import { formatRupiah, formatPercent } from '@/lib/format';

const WBS = [
  ['I', 'Persiapan'], ['II', 'Tanah'], ['III', 'Struktur'],
  ['IV', 'Arsitektur'], ['V', 'MEP'], ['VI', 'Luar'], ['VII', 'Akhir'], ['LAINNYA', 'Lainnya'],
];

const SAMPLE = `Kolom 0.3 x 0.4 x 3.5 jumlah 24
Sloof 0.15 x 0.2 x 60
Dinding bata 60 x 3.5 jumlah 1
Plesteran 60 x 3.5
Lantai keramik 8 x 6`;

interface WorkEl extends ExtractedElement {
  vol?: VolumeResult | null;
  volError?: string;
}

function confTone(c: number): 'ok' | 'warn' | 'dng' {
  return c >= 0.8 ? 'ok' : c >= 0.6 ? 'warn' : 'dng';
}

export function SmartRabBuilder({
  open, onClose, ahspList, regionCode, ppnRate, onApply,
}: {
  open: boolean;
  onClose: () => void;
  ahspList: AHSPListItem[];
  regionCode: string;
  ppnRate: number;
  onApply: (lines: { ahsp_code: string; volume: number }[]) => void;
}) {
  const [text, setText] = useState(SAMPLE);
  const [els, setEls] = useState<WorkEl[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [built, setBuilt] = useState<SectionedRABResult | null>(null);
  const [busy, setBusy] = useState<{ analyze: boolean; build: boolean }>({ analyze: false, build: false });
  const [error, setError] = useState<string | null>(null);

  const buildable = useMemo(() => els.filter((e) => e.ahsp_code && e.vol), [els]);
  const activeProvider = provider ?? providerStatus ?? 'rule-based';

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch('/api/ai/extract')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { provider?: string; model?: string } | null) => {
        if (!active || !data) return;
        setProviderStatus(data.model ?? data.provider ?? 'rule-based');
      })
      .catch(() => {
        if (active) setProviderStatus('rule-based');
      });
    return () => {
      active = false;
    };
  }, [open]);

  async function handleAnalyze() {
    setError(null);
    setBuilt(null);
    setBusy((b) => ({ ...b, analyze: true }));
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error ?? `Gagal analisa (${res.status})`);
      }
      const data = (await res.json()) as { provider: string; elements: ExtractedElement[] };
      setProvider(data.provider);
      // Engine menghitung volume tiap elemen (paralel).
      const withVol = await Promise.all(
        data.elements.map(async (el): Promise<WorkEl> => {
          if (!el.element_type) return { ...el, vol: null };
          try {
            const vol = await computeVolume(el.element_type, el.dims);
            return { ...el, vol };
          } catch (err) {
            return { ...el, vol: null, volError: err instanceof Error ? err.message : 'gagal', needs_review: true };
          }
        }),
      );
      setEls(withVol);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menganalisa teks.');
    } finally {
      setBusy((b) => ({ ...b, analyze: false }));
    }
  }

  function patchEl(id: string, patch: Partial<WorkEl>) {
    setEls((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setBuilt(null);
  }

  async function handleBuild() {
    if (!buildable.length) {
      setError('Belum ada elemen siap (butuh AHSP + volume dari engine).');
      return;
    }
    setError(null);
    setBusy((b) => ({ ...b, build: true }));
    try {
      const lines = buildable.map((e) => ({ ahsp_code: e.ahsp_code as string, volume: e.vol!.volume, section: e.section }));
      setBuilt(await buildSectionedRAB(lines, regionCode, ppnRate));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membangun RAB.');
    } finally {
      setBusy((b) => ({ ...b, build: false }));
    }
  }

  function handleApply() {
    onApply(buildable.map((e) => ({ ahsp_code: e.ahsp_code as string, volume: e.vol!.volume })));
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Susun RAB dengan AI" width={900}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill tone={activeProvider.includes('gemini') ? 'ok' : 'warn'}>
            <Sparkles size={12} /> Mode {activeProvider.includes('gemini') ? 'AI' : 'fallback'}: {activeProvider}
          </StatusPill>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            AI menstruktur item; <strong>engine</strong> menghitung volume & biaya. Sambungkan Gemini (free tier) untuk ekstraksi lebih pintar.
          </span>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)', fontSize: 12.5, color: 'var(--warn-fg)' }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Input */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
            Daftar elemen (satu per baris): <span style={{ fontWeight: 400, color: 'var(--text3)' }}>mis. "Kolom 0.3 x 0.4 x 3.5 jumlah 24" — satuan meter</span>
          </div>
          <textarea
            className="pax-input"
            style={{ minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis elemen pekerjaan beserta dimensi…"
          />
          <div style={{ marginTop: 10 }}>
            <Button onClick={handleAnalyze} disabled={busy.analyze || !text.trim()}>
              {busy.analyze ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Analisa (AI)
            </Button>
          </div>
        </div>

        {/* Hasil ekstraksi (editable) */}
        {els.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              Hasil AI — verifikasi & koreksi ({buildable.length}/{els.length} siap)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['Elemen', 'Tipe', 'AHSP', 'Seksi', 'Volume (engine)', 'Yakin', ''].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 4 || i === 5 ? 'right' : 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {els.map((el) => (
                    <tr key={el.id} style={{ background: el.needs_review ? 'var(--warn-bg)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text)', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{el.reason}</div>
                      </td>
                      <td className="pax-mono" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text2)' }}>{el.element_type || '—'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)' }}>
                        <select className="pax-input" style={{ height: 30, fontSize: 11.5, minWidth: 110 }} value={el.ahsp_code ?? ''} onChange={(e) => patchEl(el.id, { ahsp_code: e.target.value || null })}>
                          <option value="">— pilih —</option>
                          {ahspList.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)' }}>
                        <select className="pax-input" style={{ height: 30, fontSize: 11.5, width: 78 }} value={el.section} onChange={(e) => patchEl(el.id, { section: e.target.value })}>
                          {WBS.map(([c, t]) => <option key={c} value={c}>{c} {t}</option>)}
                        </select>
                      </td>
                      <td className="pax-mono" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {el.vol ? `${el.vol.volume} ${el.vol.unit}` : <span style={{ color: 'var(--dng-dot)' }}>{el.volError ? 'gagal' : '—'}</span>}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right' }}>
                        <StatusPill tone={confTone(el.confidence)} mono>{Math.round(el.confidence * 100)}%</StatusPill>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right' }}>
                        <button onClick={() => setEls((l) => l.filter((x) => x.id !== el.id))} title="Hapus" style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {el_hint(els)}
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={handleBuild} disabled={busy.build || !buildable.length}>
                {busy.build ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Bangun RAB Tersektor
              </Button>
            </div>
          </div>
        )}

        {/* RAB tersektor (dari engine) */}
        {built && <SectionedPreview built={built} />}
      </div>

      {built && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
          <Button onClick={handleApply}>Terapkan ke Editor <ArrowRight size={15} /></Button>
        </div>
      )}
    </Modal>
  );
}

function el_hint(els: WorkEl[]) {
  const review = els.filter((e) => e.needs_review).length;
  if (!review) return null;
  return (
    <p style={{ fontSize: 11, color: 'var(--warn-fg)', marginTop: 8 }}>
      {review} elemen perlu diverifikasi (disorot) — koreksi AHSP/seksi, atau perbaiki dimensi di teks lalu Analisa ulang.
    </p>
  );
}

function SectionedPreview({ built }: { built: SectionedRABResult }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}>
        RAB Tersektor — {built.region} <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(angka dari engine)</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {built.sections.map((s) => (
          <div key={s.code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              <span>{s.code}. {s.title}</span>
              <span className="pax-mono">{formatRupiah(s.subtotal)} · {formatPercent(s.weight_pct)}</span>
            </div>
            {s.lines.map((ln) => (
              <div key={ln.ahsp_code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text2)', padding: '2px 0 2px 12px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ln.name} · {ln.volume} {ln.unit}</span>
                <span className="pax-mono">{formatRupiah(ln.amount)}</span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: 'var(--text)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span>Total (incl. PPN)</span>
          <span className="pax-mono" style={{ color: 'var(--ok-dot)' }}>{formatRupiah(built.total)}</span>
        </div>
      </div>
    </div>
  );
}
