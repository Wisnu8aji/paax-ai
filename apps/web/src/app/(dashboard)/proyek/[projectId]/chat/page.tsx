'use client';

import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui';
import { chatMessages, currentUser } from '@/lib/mock/workspace';

export default function ProjectChatPage() {
  const [draft, setDraft] = useState('');

  return (
    <Card padding={0} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: 420 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={16} color="var(--text2)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Engineering Chat</span>
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>· menjelaskan angka, tidak menghitung</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((m) => {
          const mine = m.role === 'user';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row' }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: mine ? 'var(--brand-box)' : 'var(--accent)', color: mine ? 'var(--brand-ink)' : 'var(--accent-ink)' }}>
                  {mine ? currentUser.initials : 'AI'}
                </span>
                <div style={{ padding: '10px 13px', borderRadius: 13, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text)', background: mine ? 'var(--surface2)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                  {m.text}
                  <div className="pax-mono" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>{m.time}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 14, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 10 }}>
        <input
          className="pax-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tanya tentang RAB, jadwal, atau gambar… (contoh)"
          aria-label="Pesan"
        />
        <button aria-label="Kirim" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Send size={16} />
        </button>
      </div>
    </Card>
  );
}
