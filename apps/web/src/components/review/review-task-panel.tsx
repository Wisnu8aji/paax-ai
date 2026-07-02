'use client';

import { AlertTriangle } from 'lucide-react';

export interface ReviewTaskView {
  id: string;
  target_ref: string;
  reasons: string[];
  priority?: number | null;
  status?: string;
}

const S = {
  th: { textAlign: 'left' as const, padding: '6px 8px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border)' },
  td: { padding: '6px 8px', fontSize: 12, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
};

export function ReviewTaskPanel({ tasks }: { tasks: ReviewTaskView[] }) {
  if (!tasks.length) return null;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={14} color="darkorange" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Review Queue</span>
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{tasks.length} open</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={S.th}>Target</th><th style={S.th}>Priority</th><th style={S.th}>Reason</th><th style={S.th}>Status</th>
        </tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td style={{ ...S.td, fontWeight: 700 }} className="pax-mono">{task.target_ref}</td>
              <td style={S.td} className="pax-mono">{task.priority != null ? task.priority.toLocaleString('id-ID', { maximumFractionDigits: 4 }) : '-'}</td>
              <td style={{ ...S.td, color: 'var(--text2)' }}>{task.reasons.join('; ')}</td>
              <td style={S.td}>{task.status ?? 'open'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
