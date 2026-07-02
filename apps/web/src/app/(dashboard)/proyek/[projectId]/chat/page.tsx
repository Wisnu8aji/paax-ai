'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui';
import { readEngineeringChatResponse } from '@/lib/ai/engineering-chat';
import { buildProjectContextPack } from '@/lib/ai/project-context';
import { chatMessages, currentUser } from '@/lib/mock/workspace';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

interface ChatStatus {
  provider: string;
  model: string | null;
  engine: {
    online: boolean;
    url: string;
    health?: {
      status: string;
      version: string;
      ahsp_items: number;
      regions: string[];
    };
  };
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function ProjectChatPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const initialMessages = useMemo<ChatMessage[]>(() => chatMessages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    time: message.time,
  })), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/ai/chat')
      .then((res) => res.json())
      .then((data) => {
        if (alive) setStatus(data as ChatStatus);
      })
      .catch(() => {
        if (alive) setError('Status AI/engine belum bisa dibaca.');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;

    setDraft('');
    setError(null);
    setBusy(true);
    setMessages((items) => [...items, {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
      time: nowLabel(),
    }]);

    try {
      // Grounding: kirim skrip TKG + draft RAB proyek supaya AI membaca data
      // terstruktur — tidak perlu ekstrak ulang gambar/RAB (INV-TKG-01).
      const context = await buildProjectContextPack(projectId).catch(() => null);
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, projectId, ...(context ? { context } : {}) }),
      });
      const data = await readEngineeringChatResponse(response);
      setStatus({
        provider: data.provider,
        model: data.provider === 'rule-based' ? null : data.provider,
        engine: data.engine,
      });
      setMessages((items) => [...items, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.answer,
        time: nowLabel(),
      }]);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Engineering Chat gagal merespons.';
      setError(messageText);
      setMessages((items) => [...items, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: `Saya belum bisa menjawab karena koneksi chat bermasalah: ${messageText}`,
        time: nowLabel(),
      }]);
    } finally {
      setBusy(false);
    }
  }

  const engineOnline = status?.engine.online;

  return (
    <Card padding={0} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: 420 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Sparkles size={16} color="var(--text2)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Engineering Chat</span>
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>- menjelaskan angka, tidak menghitung</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: engineOnline ? 'var(--ok-dot)' : 'var(--warn-dot)' }}>
          Engine {engineOnline ? 'aktif' : 'belum aktif'}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
          AI {status?.provider ?? 'memuat'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => {
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
        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 13px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12.5 }}>
              <Loader2 size={14} className="animate-spin" />
              Menyambungkan AI dan membaca status engine...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-soft)', color: 'var(--danger)', fontSize: 12 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: 14, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 10 }}>
        <input
          className="pax-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tanya tentang RAB, jadwal, atau gambar..."
          aria-label="Pesan"
          disabled={busy}
        />
        <button type="submit" aria-label="Kirim" disabled={busy || !draft.trim()} style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', opacity: busy || !draft.trim() ? 0.65 : 1 }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </Card>
  );
}
