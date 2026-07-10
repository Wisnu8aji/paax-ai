'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Calculator,
  CalendarClock,
  ChevronDown,
  Cloud,
  FileImage,
  Filter,
  FolderPlus,
  Github,
  HardDrive,
  History,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
  Pin,
  Plus,
  Search,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react';
import { PaaxMark } from '@/components/brand/paax-logo';
import { useShell } from '@/components/app-shell/shell-context';
import {
  type ModelAlias,
  type ReasoningEffort,
  type ThinkingMode,
  PAAX_MODELS,
  composerBadge,
  resolveThinking,
} from '@/lib/paax-models';
import {
  createConversation,
  deleteConversation,
  listConversations,
  moveConversation,
  saveConversation,
  titleFromMessage,
  toggleArchived,
  togglePinned,
  type ChatConversation,
  type StoredChatMessage,
} from '@/lib/chat/chat-history';
import { currentUser } from '@/lib/mock/workspace';
import { useProjects } from '@/lib/projects/projects-context';
import type { Project } from '@/lib/projects/types';
import { chatRunStore } from '@/lib/chat/chat-run-store';
import { useActiveChatRuns, useChatRuns } from '@/lib/chat/use-chat-runs';
import { RunStatus } from '@/components/command-room/RunStatus';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * COMMAND ROOM — pengganti Engineering Chat (rombak 2026-07-07,
 * referensi G:\Dashboard\Engineering chat). Dark ala Claude app:
 * sidebar Home/Project, hero "wisnu returns!", composer Lucent/Solace,
 * Projects grid + modal Create a project, Add to Project, connectors.
 * ATURAN EMAS tetap: AI menjelaskan — angka final dari Core Engine.
 * Riwayat lokal (lib/chat/chat-history) dengan scope global 'command-room'.
 */

const SCOPE = 'command-room';

type SideTab = 'home' | 'project';
type FilterMode = 'recent' | 'archived' | 'all';

const filterLabels: Record<FilterMode, string> = {
  recent: 'Recent',
  archived: 'Archived',
  all: 'All',
};

interface PendingAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  mimeType: string;
  base64: string | null;
  supported: boolean;
  error?: string;
}

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const MAX_ATTACH = 4;
const MAX_BYTES = 8 * 1024 * 1024;

function nowLabel(): string {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}
function inferMime(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = typeof reader.result === 'string' ? reader.result : '';
      resolve(r.includes(',') ? r.split(',')[1] : r);
    };
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}`));
    reader.readAsDataURL(file);
  });
}
function updatedLabel(iso: string): string {
  return `Updated ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Spinner loading oranye — asterisk PAAX berputar pelan (referensi cchat.png). */
function OrangeSpinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        color: 'var(--cr-orange)',
        animation: 'paxspin 2.6s linear infinite',
        fontSize: 22,
        lineHeight: 1,
      }}
    >
      ✳
    </span>
  );
}

export default function CommandRoomPage() {
  const { openSettings } = useShell();
  const { projects, loading: projectsLoading, error: projectsError, backend, createProject } = useProjects();

  const [tab, setTab] = useState<SideTab>('home');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('recent');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const [modelAlias, setModelAlias] = useState<ModelAlias>('lucent');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [thinking, setThinking] = useState<ThinkingMode>('off');
  const [modelOpen, setModelOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [addToOpen, setAddToOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [usageDismissed, setUsageDismissed] = useState(false);

  const activeModelDef = PAAX_MODELS[modelAlias];
  const resolvedThinking = resolveThinking(modelAlias, thinking);
  const badgeLabel = composerBadge(modelAlias, resolvedThinking, reasoningEffort);

  // Projects page state
  const [projectSearch, setProjectSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const addToRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);
  const messages: StoredChatMessage[] = useMemo(() => active?.messages ?? [], [active]);
  const allRuns = useChatRuns(activeId);
  const pendingRuns = allRuns.filter((r) => r.state !== 'completed');
  const isBusy = pendingRuns.some((r) => r.state === 'running' || r.state === 'streaming' || r.state === 'queued');

  const chatStarted = messages.length > 0 || pendingRuns.length > 0;

  function refresh(selectId?: string | null) {
    const list = listConversations(SCOPE);
    setConversations(list);
    if (selectId !== undefined) setActiveId(selectId);
  }

  useEffect(() => {
    refresh(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeMessages = Array.isArray(messages) ? messages : [];
  const safePendingRuns = Array.isArray(pendingRuns) ? pendingRuns : [];

  const pendingRunDraftSignature = safePendingRuns
    .map((run) => {
      const draftText =
        // @ts-ignore
        run?.answerBuffer ??
        run?.finalMarkdown ??
        "";

      return draftText.length;
    })
    .join(",");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [
    safeMessages.length,
    safePendingRuns.length,
    pendingRunDraftSignature,
  ]);

  useEffect(() => {
    const hasCompletedRuns = allRuns.some(r => r.state === 'completed' && !messages.find(m => m.id === r.assistantMessageId));
    if (hasCompletedRuns) {
      refresh();
    }
  }, [allRuns, messages]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const refs = [plusRef, addToRef, modelRef, filterRef, profileRef];
    const setters = [setPlusOpen, setAddToOpen, setModelOpen, setFilterOpen, setProfileOpen];
    const onDown = (e: MouseEvent) => {
      refs.forEach((r, i) => {
        if (r.current && !r.current.contains(e.target as Node)) setters[i](false);
      });
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function showNote(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 4200);
  }

  function newChat(folderId: string | null = null) {
    setActiveId(null);
    setDraft('');
    setTab('home');
    if (folderId) {
      const conv = createConversation(SCOPE, folderId);
      refresh(conv.id);
    }
  }

  async function submitCreateProject() {
    const name = newName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    try {
      const project = await createProject({
        name,
        description: newGoal.trim() || undefined,
        location: 'Belum diisi',
        type: 'Gedung',
      });
      setNewName('');
      setNewGoal('');
      setCreateOpen(false);
      setOpenProjectId(project.id);
      setTab('project');
      refresh(activeId);
      showNote(`Project "${project.name}" dibuat dan tersimpan di ${backend}.`);
    } catch (err) {
      showNote(err instanceof Error ? err.message : 'Project gagal dibuat.');
    } finally {
      setCreatingProject(false);
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_ATTACH - attachments.length;
    if (remaining <= 0) {
      showNote(`Maksimal ${MAX_ATTACH} lampiran per pesan.`);
      setPlusOpen(false);
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    const picked: PendingAttachment[] = [];
    for (const file of selected) {
      const mimeType = inferMime(file);
      const base = {
        id: `att-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        sizeLabel: formatSize(file.size),
        mimeType,
      };
      if (!SUPPORTED_MIME.has(mimeType)) {
        picked.push({ ...base, base64: null, supported: false, error: 'Format belum dibaca AI — pakai Drawing Intelligence / Smart Import.' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        picked.push({ ...base, base64: null, supported: false, error: `Terlalu besar (maks ${formatSize(MAX_BYTES)}).` });
        continue;
      }
      try {
        picked.push({ ...base, base64: await readBase64(file), supported: true });
      } catch (err) {
        picked.push({ ...base, base64: null, supported: false, error: err instanceof Error ? err.message : 'Gagal dibaca.' });
      }
    }
    setAttachments((prev) => [...prev, ...picked]);
    setPlusOpen(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isBusy) return;

    let conversation = active;
    if (!conversation) conversation = createConversation(SCOPE, null);

    const userMsg: StoredChatMessage = { id: `u-${Date.now()}`, role: 'user', text: message, time: nowLabel() };
    let next: ChatConversation = {
      ...conversation,
      title: conversation.messages.length === 0 ? titleFromMessage(message) : conversation.title,
      messages: [...conversation.messages, userMsg],
    };
    saveConversation(next);
    setDraft('');
    setAttachments([]);
    refresh(next.id);

    const historyMessages = next.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    await chatRunStore.startChatRun({
      conversationId: next.id,
      userMessageId: userMsg.id,
      message: message,
      historyMessages,
      modelId: modelAlias,
      modelName: activeModelDef.displayName as 'Lucent' | 'Solace',
      effort: reasoningEffort,
      thinking: resolvedThinking,
    });
  }

  const visibleConvs = conversations.filter((c) => {
    if (sidebarSearch && !c.title.toLowerCase().includes(sidebarSearch.toLowerCase())) return false;
    if (filterMode === 'archived') return c.archived;
    if (filterMode === 'recent') return !c.archived;
    return true;
  });
  const pinnedConvs = visibleConvs.filter((c) => c.pinned && !c.archived);
  const listConvs = visibleConvs.filter((c) => !pinnedConvs.includes(c));

  const projectName = (projectId: string | null | undefined): string | null =>
    projectId ? projects.find((project) => project.id === projectId)?.name ?? null : null;

  const filteredProjects = projects.filter(
    (project) =>
      !projectSearch ||
      project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      project.description.toLowerCase().includes(projectSearch.toLowerCase()) ||
      project.location.toLowerCase().includes(projectSearch.toLowerCase()),
  );
  const projectConvCount = (projectId: string) => conversations.filter((c) => c.folderId === projectId).length;
  const projectUpdatedAt = (project: Project) => {
    const inside = conversations.filter((c) => c.folderId === project.id);
    return inside.length > 0 ? inside.map((c) => c.updatedAt).sort().reverse()[0] : project.updatedAt;
  };
  const openProject = openProjectId ? projects.find((project) => project.id === openProjectId) ?? null : null;

  const convRow = (c: ChatConversation) => (
    <div
      key={c.id}
      className={`pax-cr-hover ${activeId === c.id ? 'pax-cr-active' : ''}`}
      onClick={() => {
        setActiveId(c.id);
        setTab('home');
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setActiveId(c.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        borderRadius: 9,
        cursor: 'pointer',
        color: activeId === c.id ? 'var(--cr-text)' : 'var(--cr-text2)',
      }}
    >
      <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.65 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
        {chatRunStore.getActiveRunsByConversationId(c.id).length > 0 && (
          <span
            style={{
              color: 'var(--cr-orange)',
              animation: 'paxspin 2.6s linear infinite',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✳
          </span>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
      </span>
      <span className="pax-cr-row-actions" style={{ display: 'flex', gap: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); togglePinned(c.id); refresh(activeId); }}
          aria-label={`${c.pinned ? 'Lepas pin' : 'Pin'} ${c.title}`}
          title={c.pinned ? 'Lepas pin' : 'Pin'}
          style={{ border: 'none', background: 'transparent', color: c.pinned ? 'var(--cr-orange)' : 'var(--cr-text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <Pin size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleArchived(c.id); refresh(activeId === c.id ? null : activeId); }}
          aria-label={`${c.archived ? 'Keluarkan dari arsip' : 'Arsipkan'} ${c.title}`}
          title={c.archived ? 'Keluarkan dari arsip' : 'Arsipkan'}
          style={{ border: 'none', background: 'transparent', color: 'var(--cr-text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <History size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); refresh(activeId === c.id ? null : activeId); }}
          aria-label={`Hapus ${c.title}`}
          title="Hapus"
          style={{ border: 'none', background: 'transparent', color: 'var(--cr-text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );

  const sideBtn = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="pax-cr-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 9,
        border: 'none',
        background: 'transparent',
        color: 'var(--cr-text2)',
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', color: 'var(--cr-text3)' }}>{icon}</span>
      {label}
    </button>
  );

  /* ── Composer (dipakai di hero & mode chat) ── */
  const composer = (
    <div style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
      {!usageDismissed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--cr-panel2)',
            border: '1px solid var(--cr-border)',
            borderRadius: '14px 14px 0 0',
            borderBottom: 'none',
            padding: '9px 16px',
            fontSize: 12,
            color: 'var(--cr-text2)',
          }}
        >
          <span style={{ flex: 1 }}>You&apos;ve used 75% of your weekly limit</span>
          <button
            onClick={() => showNote('Info penggunaan lengkap ada di Settings → Tagihan.')}
            style={{ border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Get more usage
          </button>
          <button
            onClick={() => setUsageDismissed(true)}
            aria-label="Tutup info penggunaan"
            style={{ border: 'none', background: 'transparent', color: 'var(--cr-text3)', cursor: 'pointer', display: 'flex', padding: 2 }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--cr-panel2)', border: '1px solid var(--cr-border)', borderBottom: 'none', borderRadius: usageDismissed ? '14px 14px 0 0' : 0 }}>
          {attachments.map((a) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 9, background: 'var(--cr-elev)', border: '1px solid var(--cr-border)', fontSize: 11, color: 'var(--cr-text)' }}>
              <Paperclip size={11} color="var(--cr-text3)" />
              <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span className="pax-mono" style={{ color: 'var(--cr-text3)', fontSize: 10 }}>{a.sizeLabel}</span>
              {!a.supported && <span style={{ color: 'var(--cr-orange)', fontSize: 10.5 }}>{a.error}</span>}
              <button
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                aria-label={`Hapus lampiran ${a.name}`}
                style={{ border: 'none', background: 'transparent', color: 'var(--cr-text3)', cursor: 'pointer', display: 'flex', padding: 0 }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--cr-elev)',
          border: '1px solid var(--cr-border-strong)',
          borderRadius: usageDismissed && attachments.length === 0 ? 16 : '0 0 16px 16px',
          padding: '13px 14px 11px',
          boxShadow: '0 18px 44px rgba(0,0,0,0.3)',
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Bring the problem. I'll break it down."
          aria-label="Pesan"
          rows={chatStarted ? 1 : 2}
          disabled={isBusy}
          style={{
            width: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--cr-text)',
            fontSize: 13.5,
            lineHeight: 1.55,
            minHeight: chatStarted ? 24 : 46,
            maxHeight: 150,
            caretColor: 'var(--cr-orange)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
          {/* + lampiran/konektor */}
          <div ref={plusRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPlusOpen((v) => !v)}
              aria-label="Tambahkan konten"
              aria-expanded={plusOpen}
              className="pax-cr-hover pax-press"
              style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--cr-border)', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform .2s var(--ease)', transform: plusOpen ? 'rotate(45deg)' : 'none' }}
            >
              <Plus size={16} />
            </button>
            {plusOpen && (
              <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 40, left: 0, width: 224, borderRadius: 13, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 40 }}>
                <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                  <Paperclip size={14} style={{ color: 'var(--cr-text3)' }} /> Tambah file atau foto
                </button>
                {[
                  { icon: <Cloud size={14} />, label: 'Google Drive' },
                  { icon: <Mail size={14} />, label: 'Gmail' },
                ].map((it) => (
                  <button key={it.label} type="button" role="menuitem" onClick={() => { showNote(`Konektor ${it.label} hadir di rilis berikutnya.`); setPlusOpen(false); }} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ color: 'var(--cr-text3)', display: 'flex' }}>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <span className="pax-mono" style={{ fontSize: 9, color: 'var(--cr-orange)', border: '1px solid rgba(217,119,87,0.3)', background: 'var(--cr-orange-soft)', borderRadius: 5, padding: '1px 5px' }}>SOON</span>
                  </button>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.xlsx,.xls,.docx,.dwg"
              onChange={(e) => { void onPickFiles(e.target.files); e.target.value = ''; }}
              aria-label="Tambah file atau foto"
              style={{ display: 'none' }}
            />
          </div>

          {/* Add to Project */}
          <div ref={addToRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAddToOpen((v) => !v)}
              aria-expanded={addToOpen}
              className="pax-cr-hover pax-press"
              style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid var(--cr-border)', background: active?.folderId ? 'var(--cr-orange-soft)' : 'transparent', color: active?.folderId ? 'var(--cr-orange)' : 'var(--cr-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <FolderPlus size={13} />
              {projectName(active?.folderId) ?? 'Add to Project'}
            </button>
            {addToOpen && (
              <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 40, left: 0, width: 230, borderRadius: 13, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 40, maxHeight: 260, overflowY: 'auto' }}>
                {projects.length === 0 && (
                  <div style={{ padding: '9px 10px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>
                    Belum ada project tersimpan. Buat dulu:
                  </div>
                )}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (active) {
                        moveConversation(active.id, project.id);
                        refresh(active.id);
                        showNote(`Percakapan masuk ke "${project.name}".`);
                      } else {
                        const conv = createConversation(SCOPE, project.id);
                        refresh(conv.id);
                        showNote(`Chat baru dibuat di "${project.name}".`);
                      }
                      setAddToOpen(false);
                    }}
                    className="pax-cr-hover"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, border: 'none', background: active?.folderId === project.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <FolderPlus size={13} style={{ color: 'var(--cr-text3)' }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                  </button>
                ))}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setAddToOpen(false); setCreateOpen(true); }}
                    className="pax-cr-hover"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-orange)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Plus size={13} /> New project
                  </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Badge: model · thinking · effort */}
          <span title={badgeLabel} style={{ fontSize: 11, color: 'var(--cr-text3)', background: 'var(--cr-panel2)', border: '1px solid var(--cr-border)', borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {badgeLabel}
          </span>

          {/* Model selector */}
          <div ref={modelRef} style={{ position: 'relative' }}>
            <button
              type="button"
              id="cr-model-selector"
              onClick={() => setModelOpen((v) => !v)}
              aria-expanded={modelOpen}
              aria-haspopup="menu"
              aria-label="Pilih model AI"
              className="pax-cr-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 9px', borderRadius: 9, border: '1px solid var(--cr-border)', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              {activeModelDef.displayName}
              <ChevronDown size={13} style={{ transition: 'transform .2s var(--ease)', transform: modelOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {modelOpen && (
              <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 42, right: 0, width: 240, borderRadius: 13, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 40 }}>
                {(Object.values(PAAX_MODELS) as (typeof PAAX_MODELS)[keyof typeof PAAX_MODELS][]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setModelAlias(m.id); if (m.id === 'solace') setThinking(m.defaultThinking); if (m.id === 'lucent') setThinking('off'); setModelOpen(false); }}
                    className="pax-cr-hover"
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '9px 10px', borderRadius: 9, border: 'none', background: modelAlias === m.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--cr-text)', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{m.displayName}</span>
                    <span style={{ fontSize: 11, color: 'var(--cr-text3)' }}>{m.description}</span>
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--cr-border)', margin: '4px 8px' }} />
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--cr-text3)', marginBottom: 6 }}>Thinking</div>
                  {activeModelDef.supportsThinking ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['off', 'on'] as ThinkingMode[]).map((t) => (
                        <button key={t} type="button" onClick={() => setThinking(t)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--cr-border)', background: resolvedThinking === t ? 'var(--cr-orange-soft)' : 'transparent', color: resolvedThinking === t ? 'var(--cr-orange)' : 'var(--cr-text2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                          {t === 'on' ? 'On' : 'Off'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--cr-text3)', fontStyle: 'italic' }}>Lucent runs with thinking off</span>
                  )}
                </div>
                <div style={{ padding: '7px 10px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: 'var(--cr-text3)', marginBottom: 6 }}>Reasoning Effort</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['high', 'max'] as ReasoningEffort[]).map((e) => (
                      <button key={e} type="button" onClick={() => setReasoningEffort(e)} style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--cr-border)', background: reasoningEffort === e ? 'rgba(255,255,255,0.1)' : 'transparent', color: reasoningEffort === e ? 'var(--cr-text)' : 'var(--cr-text2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        {e === 'high' ? 'High' : 'Max'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={() => showNote('Input suara hadir di rilis berikutnya.')} aria-label="Input suara (mic)" className="pax-cr-hover pax-press" style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Mic size={15} />
          </button>
          <button type="button" onClick={() => showNote('Mode voice hadir di rilis berikutnya.')} aria-label="Mode voice" className="pax-cr-hover pax-press" style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <AudioLines size={15} />
          </button>
          <button type="submit" aria-label="Kirim" disabled={isBusy || !draft.trim()} className="pax-press" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--cr-orange)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isBusy ? 'wait' : 'pointer', opacity: isBusy || !draft.trim() ? 0.45 : 1, transition: 'opacity .2s var(--ease), transform .16s var(--ease)' }}>
            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2.4} />}
          </button>
        </div>
      </form>
    </div>
  );

  const quickActions = (
    <div className="pax-stagger" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
      {[
        { icon: <FileImage size={13} />, label: 'Analisa Gambar', prompt: 'Analisa gambar kerja saya: apa saja elemen yang terdeteksi dan bagian mana yang perlu direview?' },
        { icon: <Calculator size={13} />, label: 'Buat RAB', prompt: 'Bantu saya menyusun draft RAB — jelaskan langkah dan data apa yang dibutuhkan. Angka final dihitung engine.' },
        { icon: <TrendingUp size={13} />, label: 'Strategize', prompt: 'Bantu saya menyusun strategi pelaksanaan proyek: urutan pekerjaan, risiko jadwal, dan mitigasinya.' },
        { icon: <HardDrive size={13} />, label: 'From Drive', note: true },
        { icon: <Mail size={13} />, label: 'From Gmail', note: true },
      ].map((qa) => (
        <button
          key={qa.label}
          onClick={() => {
            if (qa.note) showNote(`Konektor "${qa.label}" hadir di rilis berikutnya.`);
            else setDraft(qa.prompt ?? '');
          }}
          className="pax-cr-hover pax-press"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--cr-border)', background: 'var(--cr-panel2)', color: 'var(--cr-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <span style={{ color: 'var(--cr-text3)', display: 'flex' }}>{qa.icon}</span>
          {qa.label}
        </button>
      ))}
    </div>
  );


  return (
    <div className="pax-command" style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', borderRadius: 0, overflow: 'hidden' }}>

      {/* ══ SIDEBAR ══ */}
      <div
        style={{
          width: 268,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--cr-panel)',
          borderRight: '1px solid rgba(150,172,194,0.08)',
        }}
      >
        {/* Segmented Home / Project */}
        <div style={{ padding: '14px 12px 10px' }}>
          <div style={{ display: 'flex', background: 'var(--cr-bg)', borderRadius: 11, padding: 3, border: '1px solid var(--cr-border)' }}>
            {(['home', 'project'] as SideTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                role="tab"
                aria-selected={tab === t}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 30,
                  borderRadius: 8,
                  border: 'none',
                  background: tab === t ? 'var(--cr-elev)' : 'transparent',
                  color: tab === t ? 'var(--cr-text)' : 'var(--cr-text3)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background .2s var(--ease), color .2s var(--ease)',
                }}
              >
                {t === 'home' ? <Home size={13} /> : <FolderPlus size={13} />}
                {t === 'home' ? 'Home' : 'Project'}
              </button>
            ))}
          </div>
        </div>

        {/* Aksi utama */}
        <div style={{ padding: '0 8px' }}>
          {sideBtn(<Plus size={15} />, 'New Chat', () => newChat())}
          {sideBtn(<Search size={15} />, 'Search', () => setSearchOpen((v) => !v))}
          {searchOpen && (
            <div className="pax-fade" style={{ padding: '2px 10px 6px' }}>
              <input
                autoFocus
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Cari percakapan…"
                aria-label="Cari percakapan"
                style={{ width: '100%', background: 'var(--cr-bg)', border: '1px solid var(--cr-border)', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: 'var(--cr-text)', outline: 'none' }}
              />
            </div>
          )}
          {sideBtn(<CalendarClock size={15} />, 'Schedule Task', () => showNote('Schedule Task (AI proaktif terjadwal) hadir di v1.5.'))}
          {sideBtn(<History size={15} />, 'Conversation History', () => { setFilterMode('all'); setSidebarSearch(''); })}
        </div>

        {/* Pinned */}
        {pinnedConvs.length > 0 && (
          <div style={{ padding: '12px 8px 0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--cr-text3)', padding: '0 10px 5px' }}>
              Pinned
            </div>
            {pinnedConvs.map((c) => convRow(c))}
          </div>
        )}

        {/* Conversation + filter */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 5px' }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--cr-text3)' }}>
              Conversation
            </span>
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                aria-label="Filter percakapan"
                aria-expanded={filterOpen}
                title={`Filter: ${filterLabels[filterMode]}`}
                className="pax-cr-hover"
                style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: filterMode !== 'recent' ? 'var(--cr-orange)' : 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Filter size={12} />
              </button>
              {filterOpen && (
                <div className="pax-scale-in" role="menu" style={{ position: 'absolute', top: 26, right: 0, width: 122, borderRadius: 11, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 14px 34px rgba(0,0,0,0.5)', padding: 4, zIndex: 30 }}>
                  {(['recent', 'archived', 'all'] as FilterMode[]).map((m) => (
                    <button
                      key={m}
                      role="menuitem"
                      onClick={() => { setFilterMode(m); setFilterOpen(false); }}
                      className="pax-cr-hover"
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: 'none', background: m === filterMode ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--cr-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                    >
                      {filterLabels[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {listConvs.map((c) => convRow(c))}
          {visibleConvs.length === 0 && (
            <div style={{ padding: '14px 10px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>
              {conversations.length === 0 ? 'Belum ada percakapan. Mulai chat pertama Anda.' : 'Tidak ada hasil untuk filter ini.'}
            </div>
          )}
        </div>

        {/* Profile bawah */}
        <div ref={profileRef} style={{ position: 'relative', borderTop: '1px solid var(--cr-border)', padding: 8 }}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            aria-label="Menu akun"
            className="pax-cr-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--cr-orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
              {currentUser.initials.toLowerCase()}
            </span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--cr-text)', fontWeight: 600 }}>
              {currentUser.name} <span style={{ color: 'var(--cr-text3)', fontWeight: 500 }}>· {currentUser.role}</span>
            </span>
            <ChevronDown size={13} color="var(--cr-text3)" style={{ transition: 'transform .2s var(--ease)', transform: profileOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {profileOpen && (
            <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 52, left: 8, right: 8, borderRadius: 12, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 14px 34px rgba(0,0,0,0.5)', padding: 5, zIndex: 30 }}>
              <button role="menuitem" onClick={() => { setProfileOpen(false); openSettings('akun'); }} className="pax-cr-hover" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                Akun & profil
              </button>
              <button role="menuitem" onClick={() => { setProfileOpen(false); openSettings('umum'); }} className="pax-cr-hover" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══ AREA UTAMA ══ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {note && (
          <div className="pax-fade" style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', borderRadius: 11, padding: '8px 16px', fontSize: 12, color: 'var(--cr-text)', boxShadow: '0 14px 34px rgba(0,0,0,0.4)' }}>
            {note}
          </div>
        )}

        {tab === 'project' ? (
          /* ── PROJECTS PAGE ── */
          <div className="pax-fade" style={{ flex: 1, overflowY: 'auto', padding: '44px 48px' }}>
            <div style={{ maxWidth: 880, margin: '0 auto' }}>
              {openProject ? (
                /* Detail project */
                <div className="pax-fade">
                  <button
                    onClick={() => setOpenProjectId(null)}
                    className="pax-cr-hover"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text2)', fontSize: 12, cursor: 'pointer', marginBottom: 14 }}
                  >
                    ← Projects
                  </button>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <h1 className="pax-serif" style={{ fontSize: 28, fontWeight: 600, color: 'var(--cr-text)', margin: 0 }}>{openProject.name}</h1>
                      {openProject.description && (
                        <p style={{ fontSize: 13, color: 'var(--cr-text2)', marginTop: 6, lineHeight: 1.6 }}>{openProject.description}</p>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, color: 'var(--cr-text3)' }}>
                        <span>{openProject.location || 'Lokasi belum diisi'}</span>
                        <span>·</span>
                        <span>{openProject.type}</span>
                        <span>·</span>
                        <span className="pax-mono">{openProject.progress}% progress</span>
                      </div>
                    </div>
                    <div ref={undefined} style={{ position: 'relative' }}>
                      <button
                        onClick={() => setConnectorsOpen((v) => !v)}
                        className="pax-cr-hover pax-press"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--cr-border-strong)', background: 'var(--cr-panel2)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Cloud size={14} /> Manage Connectors
                      </button>
                      {connectorsOpen && (
                        <div className="pax-scale-in" style={{ position: 'absolute', top: 42, right: 0, width: 232, borderRadius: 13, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 30 }}>
                          {[
                            { icon: <Cloud size={14} />, label: 'Google Drive' },
                            { icon: <Mail size={14} />, label: 'Gmail' },
                            { icon: <HardDrive size={14} />, label: 'Local Files' },
                            { icon: <Github size={14} />, label: 'GitHub' },
                          ].map((c) => (
                            <button key={c.label} onClick={() => { showNote(`Connector ${c.label} untuk project ini hadir di rilis berikutnya.`); setConnectorsOpen(false); }} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                              <span style={{ color: 'var(--cr-text3)', display: 'flex' }}>{c.icon}</span>
                              <span style={{ flex: 1 }}>{c.label}</span>
                              <span className="pax-mono" style={{ fontSize: 9, color: 'var(--cr-orange)', border: '1px solid rgba(217,119,87,0.3)', background: 'var(--cr-orange-soft)', borderRadius: 5, padding: '1px 5px' }}>SOON</span>
                            </button>
                          ))}
                          <div style={{ padding: '7px 10px', fontSize: 10.5, color: 'var(--cr-text3)', lineHeight: 1.5, borderTop: '1px solid var(--cr-border)', marginTop: 3 }}>
                            Connector hanya berlaku untuk project ini — file project lain tidak tercampur.
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { const conv = createConversation(SCOPE, openProject.id); refresh(conv.id); setTab('home'); }}
                      className="pax-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--cr-border-strong)', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> New chat
                    </button>
                  </div>

                  <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--cr-text3)' }}>
                      Chats · {projectConvCount(openProject.id)}
                    </div>
                    {conversations.filter((c) => c.folderId === openProject.id).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setActiveId(c.id); setTab('home'); }}
                        className="pax-cr-hover"
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--cr-border)', background: 'var(--cr-panel)', color: 'var(--cr-text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <MessageSquare size={14} style={{ color: 'var(--cr-text3)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                        <span className="pax-mono" style={{ fontSize: 10.5, color: 'var(--cr-text3)' }}>{updatedLabel(c.updatedAt)}</span>
                      </button>
                    ))}
                    {projectConvCount(openProject.id) === 0 && (
                      <div style={{ padding: '18px 0', fontSize: 12.5, color: 'var(--cr-text3)' }}>
                        Belum ada chat di project ini.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h1 className="pax-serif" style={{ flex: 1, fontSize: 32, fontWeight: 600, color: 'var(--cr-text)', margin: 0 }}>
                      Projects
                    </h1>
                    <button
                      className="pax-cr-hover"
                      onClick={() => showNote('Urutan sudah berdasarkan update terakhir.')}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, border: '1px solid var(--cr-border)', background: 'var(--cr-panel2)', color: 'var(--cr-text2)', fontSize: 12, cursor: 'pointer' }}
                    >
                      Sort by <strong style={{ color: 'var(--cr-text)' }}>Last updated</strong> <ChevronDown size={12} />
                    </button>
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="pax-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 10, border: '1px solid var(--cr-border-strong)', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      New project
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, background: 'var(--cr-panel2)', border: '1px solid var(--cr-border-strong)', borderRadius: 11, padding: '10px 14px' }}>
                    <Search size={15} color="var(--cr-text3)" />
                    <input
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search projects..."
                      aria-label="Search projects"
                      style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 13 }}
                    />
                  </div>
                  {projectsError && (
                    <div className="pax-fade" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 11, background: 'rgba(217,119,87,0.1)', border: '1px solid rgba(217,119,87,0.25)', color: 'var(--cr-orange)', fontSize: 12 }}>
                      {projectsError}
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--cr-text3)' }}>
                    Source: {backend === 'firestore' ? 'Firestore' : backend === 'postgres' ? 'Postgres DB API' : 'localStorage fallback'}
                  </div>

                  <div className="pax-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginTop: 22 }}>
                    {filteredProjects
                      .slice()
                      .sort((a, b) => projectUpdatedAt(b).localeCompare(projectUpdatedAt(a)))
                      .map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setOpenProjectId(f.id)}
                          className="pax-cr-hover"
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minHeight: 150, padding: '16px 17px', borderRadius: 14, border: '1px solid var(--cr-border)', background: 'var(--cr-panel)', cursor: 'pointer', textAlign: 'left', transition: 'border-color .2s var(--ease), background .2s var(--ease)' }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cr-text)' }}>{f.name}</span>
                          {f.description && (
                            <span style={{ fontSize: 12, color: 'var(--cr-text2)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {f.description}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--cr-text3)' }}>{f.location || 'Lokasi belum diisi'} · {f.type}</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--cr-text3)' }}>
                            {updatedLabel(projectUpdatedAt(f))}
                            <span>· {projectConvCount(f.id)} chat</span>
                          </span>
                        </button>
                      ))}
                    {filteredProjects.length === 0 && (
                      <div style={{ gridColumn: '1 / -1', padding: '40px 0', textAlign: 'center', color: 'var(--cr-text3)', fontSize: 13 }}>
                        {projectsLoading ? 'Memuat project...' : projects.length === 0 ? 'Belum ada project tersimpan. Klik "New project" untuk memulai.' : 'Tidak ada project yang cocok.'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : chatStarted ? (
          /* ── CHAT BERJALAN: pesan di atas, composer turun ke bawah ── */
          <>
            <div style={{ padding: '13px 22px', borderBottom: '1px solid var(--cr-border)', display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={14} /></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active?.title ?? 'Percakapan'}
              </span>
              <ChevronDown size={13} color="var(--cr-text3)" />
              <span style={{ flex: 1 }} />
              <span className="pax-mono" style={{ fontSize: 11, color: 'var(--cr-text3)' }}>PAAX · {activeModelDef.displayName}</span>
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '26px 0' }}>
              <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="pax-rise" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ maxWidth: '82%', background: 'var(--cr-elev)', border: '1px solid var(--cr-border)', borderRadius: 15, padding: '11px 15px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--cr-text)', whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="pax-rise" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={13} /></span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cr-text2)' }}>PAAX · {activeModelDef.displayName}</span>
                        <span className="pax-mono" style={{ fontSize: 10, color: 'var(--cr-text3)' }}>{m.time}</span>
                      </div>
                      <div className="cr-markdown" style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--cr-text)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                      </div>
                    </div>
                  ),
                )}
                {pendingRuns.map((run) => (
                  <div key={run.runId} className="pax-rise" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={13} /></span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cr-text2)' }}>PAAX · {run.modelName}</span>
                    </div>

                    {run.answerBuffer && (
                      <div className="cr-markdown" style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--cr-text)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.answerBuffer}</ReactMarkdown>
                      </div>
                    )}

                    {run.state !== 'completed' && (
                      <RunStatus run={run} onStop={() => chatRunStore.cancelRun(run.runId)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="pax-rise" style={{ padding: '10px 22px 18px' }}>
              {composer}
              <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--cr-text3)', marginTop: 8 }}>
                PAAX menjelaskan — angka final selalu dihitung Core Engine, bukan AI.
              </div>
            </div>
          </>
        ) : (
          /* ── HERO AWAL: logo + wisnu returns! + composer di tengah ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 22px 60px' }}>
            <div className="pax-rise" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
              <span style={{ color: 'var(--cr-orange)', display: 'flex' }}>
                <PaaxMark size={30} />
              </span>
              <span className="pax-serif" style={{ fontSize: 38, fontWeight: 500, color: 'var(--cr-text)', letterSpacing: '-0.01em' }}>
                {currentUser.name} returns!
              </span>
            </div>
            <div className="pax-rise" style={{ width: '100%', animationDelay: '80ms' }}>
              {composer}
            </div>
            <div className="pax-rise" style={{ width: '100%', animationDelay: '150ms' }}>
              {quickActions}
            </div>
          </div>
        )}
      </div>

      {/* ══ MODAL CREATE A PROJECT ══ */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create a project"
          onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setCreateOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div className="pax-scale-in" style={{ width: 520, maxWidth: '100%', background: 'var(--cr-panel)', border: '1px solid var(--cr-border-strong)', borderRadius: 16, padding: '22px 24px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--cr-text)', margin: 0 }}>Create a project</h2>
              <button
                onClick={() => setCreateOpen(false)}
                aria-label="Tutup"
                className="pax-cr-hover"
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--cr-text)', marginBottom: 7 }}>
              What are you working on?
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreateProject();
              }}
              placeholder="Name your project"
              aria-label="Name your project"
              style={{ width: '100%', background: 'var(--cr-bg)', border: '1px solid #3E77D8', borderRadius: 10, padding: '11px 13px', fontSize: 13, color: 'var(--cr-text)', outline: 'none', marginBottom: 16 }}
            />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--cr-text)', marginBottom: 7 }}>
              What are you trying to achieve?
            </label>
            <textarea
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Describe your project, goals, subject, etc..."
              aria-label="Describe your project"
              rows={4}
              style={{ width: '100%', background: 'var(--cr-bg)', border: '1px solid var(--cr-border-strong)', borderRadius: 10, padding: '11px 13px', fontSize: 13, color: 'var(--cr-text)', outline: 'none', resize: 'vertical', lineHeight: 1.55 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 20 }}>
              <button
                onClick={() => setCreateOpen(false)}
                className="pax-cr-hover pax-press"
                style={{ padding: '9px 17px', borderRadius: 10, border: 'none', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void submitCreateProject()}
                disabled={!newName.trim() || creatingProject}
                className="pax-press"
                style={{ padding: '9px 17px', borderRadius: 10, border: '1px solid var(--cr-border-strong)', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: newName.trim() && !creatingProject ? 1 : 0.5, transition: 'opacity .2s var(--ease)' }}
              >
                {creatingProject ? 'Creating...' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
