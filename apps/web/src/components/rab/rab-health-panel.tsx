'use client';

import type { ValidationResult } from '@paax/schemas';
import { ShieldCheck, AlertTriangle, Info, XCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui';

/**
 * Panel hasil RAB Health Check. Skor & peringatan 100% dari engine
 * (POST /rab/validate) — komponen ini hanya menampilkan.
 */

const sev = {
  error: { color: 'var(--dng-dot)', Icon: XCircle, label: 'Error' },
  warning: { color: 'var(--warn-fg)', Icon: AlertTriangle, label: 'Peringatan' },
  info: { color: 'var(--text2)', Icon: Info, label: 'Info' },
} as const;

function scoreColor(score: number): string {
  if (score >= 90) return 'var(--ok-dot)';
  if (score >= 70) return 'var(--warn-fg)';
  return 'var(--dng-dot)';
}

export function RabHealthPanel({ result }: { result: ValidationResult }) {
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <ShieldCheck size={18} color={scoreColor(result.score)} />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>RAB Health Check</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="pax-mono" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: scoreColor(result.score) }}>
              {result.score}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>skor / 100</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pill color="var(--dng-dot)" label={`${result.errors} error`} />
        <Pill color="var(--warn-fg)" label={`${result.warnings} peringatan`} />
        <Pill color="var(--text2)" label={`${result.infos} info`} />
        <Pill color="var(--text3)" label={`${result.items_count} item`} />
      </div>

      {result.issues.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--ok-bg, var(--surface))', border: '1px solid var(--border)', fontSize: 13, color: 'var(--ok-dot)' }}>
          <CheckCircle2 size={16} /> RAB sehat — tidak ada masalah terdeteksi engine.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.issues.map((issue, i) => {
            const s = sev[issue.severity];
            const Icon = s.Icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Icon size={16} color={s.color} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{issue.message}</div>
                  <div className="pax-mono" style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>
                    {issue.code}{issue.ahsp_code ? ` · ${issue.ahsp_code}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 12 }}>
        Aturan deterministik dari engine. AI (nanti) hanya menambah justifikasi naratif, bukan menentukan lolos/tidak.
      </p>
    </Card>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text2)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} /> {label}
    </span>
  );
}
