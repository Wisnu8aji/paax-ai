'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderPlus,
  ImagePlus,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { Card, EmptyState } from '@/components/ui';
import { readEngineeringChatResponse } from '@/lib/ai/engineering-chat';
import { buildProjectContextPack } from '@/lib/ai/project-context';
import {
  createConversation,
  createFolder,
  deleteConversation,
  deleteFolder,
  listConversations,
  listFolders,
  saveConversation,
  titleFromMessage,
  type ChatConversation,
  type ChatFolder,
  type StoredChatMessage,
} from '@/lib/chat/chat-history';
import { currentUser } from '@/lib/mock/workspace';

/**
 * Engineering Chat — AI menjelaskan, tidak pernah menghitung (Aturan Emas).
 * Riwayat & "Project Percakapan" disimpan lokal (lib/chat/chat-history).
 */

interface ChatStatus {
  provider: string;
  model: string | null;
  engine: {
    online: boolean;
    url: string;
    health?: { status: string; version: string; ahsp_items: number; regions: string[] };
  };
}

interface PendingAttachment {
  id: string;
  name: string;
  sizeLabel: string;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** Status berpikir bertingkat, kedip perlahan ala Claude. */
function ThinkingIndicator() {
  const [label, setLabel] = useState('Thinking...');
  useEffect(() => {
    const t1 = window.setTimeout(() => setLabel('Thinking more...'), 7000);
    const t2 = window.setTimeout(() => setLabel('Thinking almost done...'), 15000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        className="pax-glass"
        style={{
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          padding: '10px 14px',
          borderRadius: 13,
          color: 'var(--text2)',
          fontSize: 12.5,
        }}
      >
        <Sparkles size={14} color="var(--gold)" />
        <span className="pax-thinking" style={{ fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}

export default function ProjectChatPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [connectorNote, setConnectorNote] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const messages: StoredChatMessage[] = active?.messages ?? [];

  function refresh(selectId?: string | null) {
    const list = listConversations(projectId);
    setConversations(list);
    setFolders(listFolders(projectId));
    if (selectId !== undefined) setActiveId(selectId);
    else if (!list.some((c) => c.id === activeId)) setActiveId(list[0]?.id ?? null);
  }

  useEffect(() => {
    const list = listConversations(projectId);
    setConversations(list);
    setFolders(listFolders(projectId));
    setActiveId(list[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [plusOpen]);

  function showConnectorNote(text: string) {
    setConnectorNote(text);
    window.setTimeout(() => setConnectorNote(null), 4200);
  }

  function startConversation(folderId: string | null = null) {
    const conversation = createConversation(projectId, folderId);
    refresh(conversation.id);
  }

  function removeConversation(id: string) {
    deleteConversation(id);
    refresh(activeId === id ? null : activeId);
  }

  function submitFolder() {
    const name = newFolderName.trim();
    if (name) {
      createFolder(projectId, name);
      refresh(activeId);
    }
    setNewFolderName('');
    setNewFolderOpen(false);
  }

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const picked: PendingAttachment[] = Array.from(files).map((f) => ({
      id: `att-${Date.now()}-${f.name}`,
      name: f.name,
      sizeLabel: formatSize(f.size),
    }));
    setAttachments((prev) => [...prev, ...picked]);
    setPlusOpen(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;

    // Pastikan ada percakapan aktif (riwayat) sebelum mengirim.
    let conversation = active;
    if (!conversation) {
      conversation = createConversation(projectId, null);
    }

    const userMsg: StoredChatMessage = { id: `u-${Date.now()}`, role: 'user', text: message, time: nowLabel() };
    let next: ChatConversation = {
      ...conversation,
      title: conversation.messages.length === 0 ? titleFromMessage(message) : conversation.title,
      messages: [...conversation.messages, userMsg],
    };
    saveConversation(next);
    setDraft('');
    setError(null);
    setBusy(true);
    refresh(next.id);

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
      next = {
        ...next,
        messages: [...next.messages, { id: `a-${Date.now()}`, role: 'assistant', text: data.answer, time: nowLabel() }],
      };
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Engineering Chat gagal merespons.';
      setError(messageText);
      next = {
        ...next,
        messages: [
          ...next.messages,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: `Saya belum bisa menjawab karena koneksi chat bermasalah: ${messageText}`,
            time: nowLabel(),
          },
        ],
      };
    } finally {
      saveConversation(next);
      setBusy(false);
      refresh(next.id);
    }
  }

  const engineOnline = status?.engine.online;
  const looseConversations = conversations.filter((c) => !c.folderId || !folders.some((f) => f.id === c.folderId));

  const conversationRow = (c: ChatConversation, indent = false) => (
    <div
      key={c.id}
      className="pax-nav-item"
      onClick={() => setActiveId(c.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setActiveId(c.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: indent ? '7px 8px 7px 26px' : '7px 8px',
        borderRadius: 9,
        cursor: 'pointer',
        background: activeId === c.id ? 'var(--side-active-bg)' : 'transparent',
        color: activeId === c.id ? 'var(--side-active-ink)' : 'var(--side-text)',
      }}
    >
      <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: activeId === c.id ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.title}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeConversation(c.id);
        }}
        aria-label={`Hapus percakapan ${c.title}`}
        title="Hapus percakapan"
        style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '242px 1fr', gap: 14, height: 'calc(100vh - 230px)', minHeight: 500 }}
      className="pax-grid-2"
    >
      {/* ── Panel riwayat & project percakapan ── */}
      <Card padding={0} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '13px 12px 9px' }}>
          <span className="pax-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
            Percakapan
          </span>
          <button
            onClick={() => setNewFolderOpen((v) => !v)}
            title="Buat Project Percakapan"
            aria-label="Buat Project Percakapan"
            className="pax-btn-ghost"
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => startConversation(null)}
            title="Percakapan baru"
            aria-label="Percakapan baru"
            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Plus size={15} />
          </button>
        </div>

        {newFolderOpen && (
          <div style={{ padding: '0 12px 9px', display: 'flex', gap: 6 }}>
            <input
              className="pax-input"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitFolder()}
              placeholder="Nama project percakapan…"
              aria-label="Nama project percakapan"
              style={{ fontSize: 12, padding: '7px 10px' }}
            />
            <button
              onClick={submitFolder}
              aria-label="Simpan project percakapan"
              style={{ borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', padding: '0 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
            >
              OK
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {folders.map((f) => {
            const inFolder = conversations.filter((c) => c.folderId === f.id);
            const collapsed = collapsedFolders[f.id];
            return (
              <div key={f.id}>
                <div
                  className="pax-nav-item"
                  onClick={() => setCollapsedFolders((m) => ({ ...m, [f.id]: !m[f.id] }))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setCollapsedFolders((m) => ({ ...m, [f.id]: !m[f.id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 9, cursor: 'pointer', color: 'var(--side-text)' }}
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <Folder size={13} color="var(--gold)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  <span className="pax-mono" style={{ fontSize: 10, color: 'var(--text3)' }}>{inFolder.length}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startConversation(f.id);
                    }}
                    aria-label={`Percakapan baru di ${f.name}`}
                    title="Percakapan baru di project ini"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(f.id);
                      refresh(activeId);
                    }}
                    aria-label={`Hapus project ${f.name}`}
                    title="Hapus project (percakapan dilepas, tidak ikut terhapus)"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {!collapsed && inFolder.map((c) => conversationRow(c, true))}
              </div>
            );
          })}

          {looseConversations.length > 0 && folders.length > 0 && (
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)', padding: '10px 8px 4px' }}>
              Lainnya
            </div>
          )}
          {looseConversations.map((c) => conversationRow(c))}

          {conversations.length === 0 && (
            <div style={{ padding: '18px 10px', fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>
              Belum ada riwayat. Mulai percakapan pertama — riwayat tersimpan otomatis di peramban Anda.
            </div>
          )}
        </div>
      </Card>

      {/* ── Area chat ── */}
      <Card padding={0} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Sparkles size={16} color="var(--gold)" />
          <span className="pax-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Engineering Chat</span>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>— menjelaskan angka, tidak menghitung</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: engineOnline ? 'var(--ok-dot)' : 'var(--warn-fg)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: engineOnline ? 'var(--ok-dot)' : 'var(--warn-fg)' }} />
            Engine {engineOnline ? 'aktif' : 'belum aktif'}
          </span>
          <span className="pax-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>AI {status?.provider ?? 'memuat'}</span>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && !busy && (
            <EmptyState
              title="Mulai percakapan"
              message="Tanya apa pun tentang RAB, jadwal, atau gambar proyek ini. Jawaban AI ter-grounding data proyek; angka final selalu dari Core Engine."
            />
          )}
          {messages.map((m) => {
            const mine = m.role === 'user';
            return (
              <div key={m.id} className="pax-fade" style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '78%', display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: mine ? 'var(--brand-box)' : 'var(--gold-soft)', color: mine ? 'var(--brand-ink)' : 'var(--gold)', border: mine ? 'none' : '1px solid var(--gold-bd)' }}>
                    {mine ? currentUser.initials : 'AI'}
                  </span>
                  <div style={{ padding: '10px 13px', borderRadius: 13, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)', background: mine ? 'var(--surface2)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                    {m.text}
                    <div className="pax-mono" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>{m.time}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {busy && <ThinkingIndicator />}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-soft)', color: 'var(--warn-fg)', fontSize: 12 }}>
            {error}
          </div>
        )}
        {connectorNote && (
          <div className="pax-fade" style={{ padding: '8px 16px', borderTop: '1px solid var(--border-soft)', color: 'var(--text2)', fontSize: 11.5 }}>
            {connectorNote}
          </div>
        )}
        {attachments.length > 0 && (
          <div style={{ padding: '10px 14px 0', display: 'flex', gap: 7, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)' }}>
            {attachments.map((a) => (
              <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text)' }}>
                <Paperclip size={11} color="var(--text3)" />
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span className="pax-mono" style={{ color: 'var(--text3)', fontSize: 10 }}>{a.sizeLabel}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label={`Hapus lampiran ${a.name}`}
                  style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', padding: 0 }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <span style={{ fontSize: 10.5, color: 'var(--text3)', alignSelf: 'center' }}>
              Lampiran belum dikirim ke AI — hadir bersama konektor. Fallback: unggah lewat File & Dokumen.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: 14, borderTop: attachments.length > 0 ? 'none' : '1px solid var(--border-soft)', display: 'flex', gap: 9, alignItems: 'flex-end' }}>
          {/* Tombol + : konektor & lampiran */}
          <div ref={plusRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setPlusOpen((v) => !v)}
              aria-label="Tambahkan konten (konektor & file)"
              aria-expanded={plusOpen}
              title="Konektor & lampiran"
              style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform .15s', transform: plusOpen ? 'rotate(45deg)' : 'none' }}
            >
              <Plus size={17} />
            </button>
            {plusOpen && (
              <div
                className="pax-glass pax-glass-edge pax-fade"
                role="menu"
                style={{ position: 'absolute', bottom: 48, left: 0, width: 236, borderRadius: 14, boxShadow: 'var(--shadow-modal)', padding: 6, zIndex: 30 }}
              >
                {[
                  { icon: <Cloud size={15} />, label: 'Google Drive', note: 'segera', action: () => showConnectorNote('Konektor Google Drive hadir di rilis berikutnya — file proyek tetap bisa diunggah lewat File & Dokumen.') },
                  { icon: <Mail size={15} />, label: 'Gmail', note: 'segera', action: () => showConnectorNote('Konektor Gmail hadir di rilis berikutnya.') },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      item.action();
                      setPlusOpen(false);
                    }}
                    className="pax-row-hover"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ color: 'var(--text2)', display: 'flex' }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span className="pax-mono" style={{ fontSize: 9, fontWeight: 600, color: 'var(--gold)', border: '1px solid var(--gold-bd)', background: 'var(--gold-soft)', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' }}>
                      {item.note}
                    </span>
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--border-soft)', margin: '5px 8px' }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => fileInputRef.current?.click()}
                  className="pax-row-hover"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ color: 'var(--text2)', display: 'flex' }}><ImagePlus size={15} /></span>
                  Tambah file atau foto
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.xlsx,.xls,.docx,.dwg"
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = '';
              }}
              aria-label="Tambah file atau foto"
              style={{ display: 'none' }}
            />
          </div>

          <textarea
            className="pax-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Tanya tentang RAB, jadwal, atau gambar… (Enter kirim, Shift+Enter baris baru)"
            aria-label="Pesan"
            rows={1}
            disabled={busy}
            style={{ resize: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5 }}
          />
          <button
            type="submit"
            aria-label="Kirim"
            disabled={busy || !draft.trim()}
            style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer', opacity: busy || !draft.trim() ? 0.65 : 1, transition: 'opacity .15s' }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </Card>
    </div>
  );
}
