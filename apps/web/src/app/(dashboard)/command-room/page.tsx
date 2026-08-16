'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cloud,
  Copy,
  Download,
  FileText,
  Filter,
  FolderPlus,
  Check,
  Github,
  GitBranch,
  HardDrive,
  History,
  Home,
  ListTodo,
  Loader2,
  MessageSquare,
  Mail,
  Mic,
  MoreVertical,
  Paperclip,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Square,
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
  DEFAULT_MODEL_ALIAS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING,
  composerBadge,
  resolveThinking,
} from '@/lib/paax-models';
import {
  branchConversation,
  createConversation,
  deleteConversation,
  listConversations,
  moveConversation,
  renameConversation,
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
import { ProcessingTrace, RunStatus } from '@/components/command-room/RunStatus';
import { ChatPartsRenderer } from '@/components/command-room/ChatPartsRenderer';
import {
  clampComposerHeight,
  COMMAND_COMPOSER_MAX_HEIGHT,
  COMMAND_EFFORT_OPTIONS,
  COMMAND_HEADER_ICON_SIZE,
  COMMAND_MODEL_MENU_ROWS,
  COMMAND_THINKING_OPTIONS,
  getDefaultCommandModelSettings,
} from '@/components/command-room/command-room-ui';
import { CommandRoomWorkSurface } from '@/components/command-room/command-room-work';
import { validateAttachmentMeta, type ChatAttachmentRef } from '@/lib/chat/attachment-contract';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * COMMAND ROOM — pengganti Engineering Chat (rombak 2026-07-07,
 * referensi G:\Dashboard\Engineering chat). Dark ala Saya app:
 * sidebar Home/Project, hero "wisnu returns!", composer Lucent/Arete/Noir,
 * Projects grid + modal Create a project, Add to Project, connectors.
 * ATURAN EMAS tetap: AI menjelaskan — angka final untuk Work tetap dari Core Engine.
 * Chat memakai server history bila tersedia dan cache browser sebagai fallback.
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
  attachmentId?: string;
  name: string;
  sizeLabel: string;
  sizeBytes: number;
  mimeType: string;
  supported: boolean;
  status: 'uploading' | 'staged' | 'failed';
  error?: string;
}

const SUPPORTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
]);
const MAX_ATTACH = 4;

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
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (n.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
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
  return (
    <Suspense fallback={null}>
      <CommandRoomContent />
    </Suspense>
  );
}

function CommandRoomContent() {
  const { openSettings } = useShell();
  const { projects, loading: projectsLoading, error: projectsError, backend, createProject } = useProjects();
  const router = useRouter();

  const [tab, setTab] = useState<SideTab>('home');
  const [roomMode, setRoomMode] = useState<'chat' | 'work'>('chat');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('recent');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const [modelAlias, setModelAlias] = useState<ModelAlias>(DEFAULT_MODEL_ALIAS);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [thinking, setThinking] = useState<ThinkingMode>(DEFAULT_THINKING);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelMenuSection, setModelMenuSection] = useState<'model' | 'effort' | 'thinking'>('model');
  const [plusOpen, setPlusOpen] = useState(false);
  const [addToOpen, setAddToOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [usageDismissed, setUsageDismissed] = useState(true);
  const [composerTall, setComposerTall] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidePanelTab, setSidePanelTab] = useState<'activity' | 'sources' | 'summary'>('activity');
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [moveSubOpen, setMoveSubOpen] = useState(false);

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
  const composerTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const plusRef = useRef<HTMLDivElement>(null);
  const addToRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const titleMenuRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);
  const messages: StoredChatMessage[] = useMemo(() => active?.messages ?? [], [active]);
  const allRuns = useChatRuns(activeId);
  const pendingRuns = allRuns.filter((r) => r.state !== 'completed');
  const isBusy = pendingRuns.some((r) => r.state === 'running' || r.state === 'streaming' || r.state === 'queued');
  const activeExecution = pendingRuns.find((r) => r.state === 'running' || r.state === 'streaming');
  const queuedRuns = pendingRuns.filter((r) => r.state === 'queued');

  const chatStarted = messages.length > 0 || pendingRuns.length > 0;

  function refresh(selectId?: string | null) {
    const list = listConversations(SCOPE);
    setConversations(list);
    if (selectId !== undefined) setActiveId(selectId);
  }

  function patchServerConversation(id: string, update: { title?: string; pinned?: boolean; archived?: boolean; projectId?: string | null }) {
    void fetch(`/api/command-room/conversations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    }).catch(() => undefined);
  }

  function deleteServerConversation(id: string) {
    void fetch(`/api/command-room/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  useEffect(() => {
    refresh(null);
    let disposed = false;
    const hydrateServerHistory = async () => {
      try {
        const response = await fetch('/api/command-room/conversations', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.durable || !Array.isArray(body.conversations)) return;
        const serverConversations = await Promise.all(body.conversations.map(async (row: any): Promise<ChatConversation | null> => {
          if (!row?.id) return null;
          const messagesResponse = await fetch(`/api/command-room/conversations/${encodeURIComponent(row.id)}/messages`, { cache: 'no-store' });
          const messagesBody = await messagesResponse.json().catch(() => ({}));
          const queueResponse = await fetch(`/api/command-room/conversations/${encodeURIComponent(row.id)}/queue`, { cache: 'no-store' });
          const queueBody = await queueResponse.json().catch(() => ({}));
          if (queueResponse.ok && queueBody.durable && Array.isArray(queueBody.entries)) {
            queueBody.entries
              .filter((entry: any) => entry?.state === 'queued' || entry?.state === 'parked')
              .forEach((entry: any) => chatRunStore.hydrateQueuedRun({ ...entry, conversation_id: row.id }));
          }
          const serverMessages = Array.isArray(messagesBody.messages) ? messagesBody.messages : [];
          const messages: StoredChatMessage[] = serverMessages
            .filter((item: any) => item?.role === 'user' || item?.role === 'assistant')
            .map((item: any) => ({
              id: item.id ?? `server-${item.sequence}`,
              role: item.role,
              text: typeof item.content === 'string' ? item.content : '',
              time: item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : nowLabel(),
              parts: Array.isArray(item.parts) ? item.parts : undefined,
              model: item.model_alias ? { alias: item.model_alias, displayName: PAAX_MODELS[item.model_alias as ModelAlias]?.displayName ?? item.model_alias } : undefined,
              sources: Array.isArray(item.sources) ? item.sources : undefined,
              artifacts: Array.isArray(item.artifacts) ? item.artifacts : undefined,
              turnId: item.turn_id ?? undefined,
              status: item.role === 'assistant' ? 'completed' : undefined,
            }));
          return {
            id: row.id,
            projectId: SCOPE,
            folderId: row.project_id ?? null,
            boundProjectId: row.project_id ?? null,
            title: row.title || 'Percakapan baru',
            messages,
            pinned: Boolean(row.pinned),
            archived: Boolean(row.archived),
            createdAt: row.created_at ?? new Date().toISOString(),
            updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
            connectors: { gambarKerja: false, rab: false, jadwal: false },
            persistence: 'server',
          };
        }));
        if (disposed) return;
        const local = listConversations(SCOPE);
        const serverIds = new Set(serverConversations.filter(Boolean).map((item) => item!.id));
        const merged = [
          ...serverConversations.filter((item): item is ChatConversation => Boolean(item)),
          ...local.filter((item) => !serverIds.has(item.id)),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        merged.filter((item) => item.persistence === 'server').forEach(saveConversation);
        setConversations(merged);
      } catch {
        // local cache remains usable when the DB adapter is unavailable.
      }
    };
    void hydrateServerHistory();
    return () => { disposed = true; };
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
    // Jangan paksa scroll ke bawah kalau user sedang membaca ke atas —
    // biarkan tombol scroll-to-bottom / active-generation-indicator yang
    // menawarkan lompat ke bawah, bukan auto-scroll yang menyentak.
    if (userScrolledUpRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [
    safeMessages.length,
    safePendingRuns.length,
    pendingRunDraftSignature,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const scrolledUp = distanceFromBottom > 120;
      userScrolledUpRef.current = scrolledUp;
      setShowScrollToBottom(scrolledUp);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeId]);

  function scrollToBottom() {
    userScrolledUpRef.current = false;
    setShowScrollToBottom(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }

  useEffect(() => {
    const hasCompletedRuns = allRuns.some(r => r.state === 'completed' && !messages.find(m => m.id === r.assistantMessageId));
    if (hasCompletedRuns) {
      refresh();
    }
  }, [allRuns, messages]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const refs = [plusRef, addToRef, modelRef, filterRef, profileRef, titleMenuRef];
    const setters = [setPlusOpen, setAddToOpen, setModelOpen, setFilterOpen, setProfileOpen, setTitleMenuOpen];
    const onDown = (e: MouseEvent) => {
      refs.forEach((r, i) => {
        if (r.current && !r.current.contains(e.target as Node)) setters[i](false);
      });
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen]);

  function showNote(text: string) {
    setNote(text);
    window.setTimeout(() => setNote(null), 4200);
  }

  async function copyMessageText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      window.setTimeout(() => setCopiedMessageId((cur) => (cur === id ? null : cur)), 1600);
    } catch {
      showNote('Gagal menyalin ke clipboard.');
    }
  }

  function exportMessageText(text: string, role: 'user' | 'assistant') {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paax-${role}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const messageActions = (id: string, text: string, role: 'user' | 'assistant') => (
    <span className="pax-msg-actions" style={{ display: 'flex', gap: 4 }}>
      <button
        type="button"
        onClick={() => copyMessageText(id, text)}
        aria-label="Salin pesan"
        title="Salin"
        className="pax-cr-hover cr-message-action"
        style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        {copiedMessageId === id ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button
        type="button"
        onClick={() => exportMessageText(text, role)}
        aria-label="Ekspor ke .txt"
        title="Ekspor .txt"
        className="pax-cr-hover cr-message-action"
        style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <Download size={12} />
      </button>
    </span>
  );

  function newChat(folderId?: string | null) {
    const boundProjectId = folderId === undefined ? openProjectId : folderId;
    setActiveId(null);
    setDraft('');
    setTab('home');
    if (boundProjectId) {
      const conv = createConversation(SCOPE, boundProjectId, boundProjectId);
      refresh(conv.id);
    }
  }

  function startRename() {
    if (!active) return;
    setRenameDraft(active.title);
    setRenaming(true);
    setTitleMenuOpen(false);
  }

  function submitRename() {
    if (active) {
      const title = renameDraft.trim();
      renameConversation(active.id, title);
      patchServerConversation(active.id, { title });
    }
    setRenaming(false);
    refresh(active?.id ?? null);
  }

  function openNewBranch() {
    if (!active) return;
    const branch = branchConversation(active.id);
    if (!branch) return;
    setTitleMenuOpen(false);
    refresh(branch.id);
    showNote(`Branch "${branch.title}" dibuat — riwayat percakapan ter-copy, lanjutkan bebas di sini.`);
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
    for (const file of selected) {
      const mimeType = inferMime(file);
      const localId = `att-${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`;
      const base: PendingAttachment = {
        id: localId,
        name: file.name,
        sizeLabel: formatSize(file.size),
        sizeBytes: file.size,
        mimeType,
        supported: false,
        status: 'failed',
      };
      const validation = validateAttachmentMeta({ name: file.name, mimeType, sizeBytes: file.size });
      if (!validation.ok || !SUPPORTED_MIME.has(mimeType)) {
        setAttachments((prev) => [...prev, { ...base, error: validation.ok ? 'Format belum didukung.' : validation.error }]);
        continue;
      }
      setAttachments((prev) => [...prev, { ...base, supported: true, status: 'uploading' }]);
      try {
        const form = new FormData();
        form.append('file', file, file.name);
        if (active?.id) form.append('conversationId', active.id);
        const response = await fetch('/api/command-room/attachments', { method: 'POST', body: form });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.attachment) throw new Error(body.error || 'Lampiran gagal di-stage.');
        const attachment = body.attachment as ChatAttachmentRef;
        setAttachments((prev) => prev.map((item) => item.id === localId
          ? { ...item, attachmentId: attachment.attachment_id, status: 'staged' }
          : item));
      } catch (err) {
        setAttachments((prev) => prev.map((item) => item.id === localId
          ? { ...item, supported: false, status: 'failed', error: err instanceof Error ? err.message : 'Lampiran gagal di-stage.' }
          : item));
      }
    }
    setPlusOpen(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    const uploadingAttachment = attachments.some((attachment) => attachment.status === 'uploading');
    if (uploadingAttachment) {
      showNote('Tunggu sampai upload lampiran selesai sebelum mengirim.');
      return;
    }
    const submittedAttachments = attachments.filter((attachment) => attachment.supported && attachment.status === 'staged' && attachment.attachmentId);
    const steerActiveRun = isBusy && submittedAttachments.length === 0 ? activeExecution : undefined;

    let conversation = active;
    if (!conversation) conversation = createConversation(SCOPE, openProjectId, openProjectId);

    const userMsg: StoredChatMessage = { id: `u-${Date.now()}`, role: 'user', text: message, time: nowLabel() };
    let next: ChatConversation = {
      ...conversation,
      title: conversation.messages.length === 0 ? titleFromMessage(message) : conversation.title,
      messages: [...conversation.messages, userMsg],
    };
    saveConversation(next);
    setDraft('');
    if (composerTextAreaRef.current) composerTextAreaRef.current.style.height = '22px';
    setAttachments([]);
    refresh(next.id);

    const historyMessages = next.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    if (steerActiveRun) {
      const steered = await chatRunStore.steerRun(steerActiveRun.runId, message);
      if (steered) {
        showNote('Steer diterima — jawaban aktif akan menyesuaikan instruksi ini.');
        return;
      }
      // Redirect race: the active turn may have ended between the UI check and
      // the control request. Keep the correction as a normal FIFO turn below.
      showNote('Turn aktif selesai tepat saat steer dikirim; koreksi masuk antrian.');
    }

    await chatRunStore.startChatRun({
      conversationId: next.id,
      userMessageId: userMsg.id,
      message: message,
      historyMessages,
      modelId: modelAlias,
      modelName: activeModelDef.displayName as 'Lucent' | 'Arete' | 'Noir',
      effort: reasoningEffort,
      thinking: resolvedThinking,
      projectId: next.boundProjectId ?? next.folderId ?? undefined,
      conversationTitle: next.title,
      messageSequence: next.messages.length - 1,
      attachments: submittedAttachments.map((attachment) => ({
        attachment_id: attachment.attachmentId as string,
        conversation_id: next.id,
        name: attachment.name,
        media_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        sha256: '',
        status: 'staged' as const,
      })),
    });
  }

  const sidebarScopeFolderId = openProjectId; // null = Home (percakapan tanpa project), string = percakapan project ini saja
  // Tab segmented Home/Project tetap menunjuk "Project" selama masih di dalam
  // sebuah project (openProjectId terisi) — walau `tab` sempat di-set 'home'
  // untuk memindahkan area utama ke tampilan chat (lihat openProject chat list).
  const effectiveTab: SideTab = openProjectId ? 'project' : tab;
  const visibleConvs = conversations.filter((c) => {
    if (c.folderId !== sidebarScopeFolderId) return false;
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
        padding: '5px 9px',
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
          onClick={(e) => { e.stopPropagation(); patchServerConversation(c.id, { pinned: !c.pinned }); togglePinned(c.id); refresh(activeId); }}
          aria-label={`${c.pinned ? 'Lepas pin' : 'Pin'} ${c.title}`}
          title={c.pinned ? 'Lepas pin' : 'Pin'}
          style={{ border: 'none', background: 'transparent', color: c.pinned ? 'var(--cr-orange)' : 'var(--cr-text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <Pin size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); patchServerConversation(c.id, { archived: !c.archived }); toggleArchived(c.id); refresh(activeId === c.id ? null : activeId); }}
          aria-label={`${c.archived ? 'Keluarkan dari arsip' : 'Arsipkan'} ${c.title}`}
          title={c.archived ? 'Keluarkan dari arsip' : 'Arsipkan'}
          style={{ border: 'none', background: 'transparent', color: 'var(--cr-text3)', cursor: 'pointer', padding: 2, display: 'flex' }}
        >
          <History size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteServerConversation(c.id); deleteConversation(c.id); refresh(activeId === c.id ? null : activeId); }}
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
        padding: '5px 10px',
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

  async function fetchConversationSummary(conv: ChatConversation) {
    setSummaryLoadingId(conv.id);
    setSummaryError(null);
    try {
      const res = await fetch('/api/command-room/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: conv.title,
          messages: conv.messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat ringkasan.');
      setSummaryCache((prev) => ({ ...prev, [conv.id]: data.summary }));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Gagal membuat ringkasan.');
    } finally {
      setSummaryLoadingId((cur) => (cur === conv.id ? null : cur));
    }
  }

  useEffect(() => {
    if (sidePanelTab !== 'summary' || !active) return;
    if (active.messages.length === 0) return;
    if (summaryCache[active.id]) return;
    void fetchConversationSummary(active);
  }, [sidePanelTab, active?.id, active?.messages.length]);

  const sidePanel = (
    <div className="pax-cr-panel-slide cr-side-panel" style={{ width: 312, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--cr-panel)' }}>
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', background: 'var(--cr-bg)', borderRadius: 11, padding: 3 }}>
          {(['activity', 'sources', 'summary'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSidePanelTab(t)}
              role="tab"
              aria-selected={sidePanelTab === t}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 28, borderRadius: 8, border: 'none', background: sidePanelTab === t ? 'var(--cr-elev)' : 'transparent', color: sidePanelTab === t ? 'var(--cr-text)' : 'var(--cr-text3)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', transition: 'background .2s var(--ease), color .2s var(--ease)' }}
            >
              {t === 'activity' ? <ListTodo size={12} /> : t === 'sources' ? <Search size={12} /> : <FileText size={12} />}
              {t === 'activity' ? 'Activity' : t === 'sources' ? 'Sources' : 'Summary'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>
        {sidePanelTab === 'activity' ? (
          allRuns.length === 0 ? (
            <div style={{ padding: '14px 8px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>Aktivitas turn akan muncul di sini.</div>
          ) : (
            allRuns.flatMap((run) => run.activitySteps.map((step) => (
              <div key={`${run.runId}-${step.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', borderRadius: 9, background: step.state === 'active' ? 'rgba(217,119,87,0.08)' : 'transparent' }}>
                <span style={{ width: 7, height: 7, marginTop: 4, borderRadius: '50%', background: step.state === 'failed' ? 'var(--cr-orange)' : step.state === 'active' ? 'var(--cr-orange)' : 'var(--cr-text3)', flexShrink: 0 }} />
                <span style={{ minWidth: 0, fontSize: 11.5, color: 'var(--cr-text2)', lineHeight: 1.45 }}>{step.label}{step.detail ? <small style={{ display: 'block', color: 'var(--cr-text3)' }}>{step.detail}</small> : null}</span>
              </div>
            )))
          )
        ) : sidePanelTab === 'sources' ? (
          (() => {
            const sources = allRuns.flatMap((run) => run.sources);
            const artifacts = allRuns.flatMap((run) => run.artifacts);
            return sources.length === 0 && artifacts.length === 0 ? (
              <div style={{ padding: '14px 8px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>Sumber dan artifact nyata akan tampil setelah runtime menambahkannya.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sources.map((source) => <a key={source.source_id} href={source.uri || '#'} target="_blank" rel="noreferrer" style={{ padding: '8px 9px', borderRadius: 9, background: 'var(--cr-elev)', color: 'var(--cr-text2)', fontSize: 11.5, textDecoration: 'none' }}><strong style={{ display: 'block', color: 'var(--cr-text)' }}>{source.title}</strong><span>{source.provenance}{source.locator ? ` · ${source.locator}` : ''}</span></a>)}
                {artifacts.map((artifact) => <a key={artifact.artifact_id} href={artifact.download_url || '#'} style={{ padding: '8px 9px', borderRadius: 9, background: 'var(--cr-elev)', color: 'var(--cr-text2)', fontSize: 11.5, textDecoration: 'none' }}><strong style={{ display: 'block', color: 'var(--cr-text)' }}>{artifact.name}</strong><span>{artifact.status}</span></a>)}
              </div>
            );
          })()
        ) : !active ? (
          <div style={{ padding: '14px 8px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>
            Pilih percakapan untuk melihat ringkasannya.
          </div>
        ) : active.messages.length === 0 ? (
          <div style={{ padding: '14px 8px', fontSize: 11.5, color: 'var(--cr-text3)', lineHeight: 1.5 }}>
            Belum ada pesan di percakapan ini.
          </div>
        ) : (
          (() => {
            const isLoading = summaryLoadingId === active.id;
            const cached = summaryCache[active.id];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => void fetchConversationSummary(active)}
                    disabled={isLoading}
                    aria-label="Buat ulang ringkasan"
                    title="Buat ulang ringkasan"
                    className="pax-cr-hover"
                    style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isLoading ? 'wait' : 'pointer' }}
                  >
                    <RotateCcw size={11} />
                  </button>
                </div>
                {isLoading && !cached && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', background: 'var(--cr-elev)', borderRadius: 11, fontSize: 11.5, color: 'var(--cr-text2)' }}>
                    <Loader2 size={13} className="animate-spin" /> Meringkas percakapan…
                  </div>
                )}
                {!isLoading && summaryError && !cached && (
                  <div style={{ padding: '11px 12px', background: 'var(--cr-elev)', borderRadius: 11, fontSize: 11.5, lineHeight: 1.6, color: 'var(--cr-orange)' }}>
                    {summaryError}
                  </div>
                )}
                {cached && (
                  <div className="cr-markdown cr-summary-markdown" style={{ background: 'var(--cr-elev)', borderRadius: 11, padding: '11px 12px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--cr-text2)' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cached}</ReactMarkdown>
                    {isLoading && <span style={{ opacity: 0.6 }}> (memperbarui…)</span>}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );

  /* ── Composer (dipakai di hero & mode chat) ── */
  const composer = (
    <div className="cr-composer-shell" style={{ width: '100%', maxWidth: 820, margin: '0 auto' }}>
      {/* Optional project context; Chat capabilities remain independent from Work. */}
      <div className="cr-connector-row">
        <div ref={addToRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setAddToOpen((v) => !v)}
            aria-expanded={addToOpen}
            aria-haspopup="menu"
            aria-label="Pilih atau buat project"
            className="pax-cr-hover pax-press cr-project-chip"
            data-active={active?.folderId ? 'true' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 28, padding: '0 12px', borderRadius: 999, border: 'none', background: 'var(--cr-panel2)', color: active?.folderId ? 'var(--cr-orange)' : 'var(--cr-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <FolderPlus size={13} />
            {projectName(active?.boundProjectId ?? active?.folderId) ?? 'Home Chat'}
            <ChevronDown size={12} style={{ opacity: 0.6, transition: 'transform .2s var(--ease)', transform: addToOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {addToOpen && (
            <div className="pax-scale-in" role="menu" style={{ position: 'absolute', top: 34, left: 0, width: 230, borderRadius: 13, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 40, maxHeight: 260, overflowY: 'auto' }}>
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
                      patchServerConversation(active.id, { projectId: project.id });
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

      </div>

      {!usageDismissed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--cr-panel2)',
            border: 'none',
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
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--cr-panel2)', border: 'none', borderBottom: 'none', borderRadius: usageDismissed ? '14px 14px 0 0' : 0 }}>
          {attachments.map((a) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 9, background: 'var(--cr-elev)', border: 'none', fontSize: 11, color: 'var(--cr-text)' }}>
              <Paperclip size={11} color="var(--cr-text3)" />
              <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span className="pax-mono" style={{ color: 'var(--cr-text3)', fontSize: 10 }}>{a.sizeLabel}</span>
              {a.status === 'uploading' && <span style={{ color: 'var(--cr-text3)', fontSize: 10.5 }}>mengunggah…</span>}
              {a.status === 'staged' && <span style={{ color: 'var(--cr-green, #74c69d)', fontSize: 10.5 }}>siap</span>}
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
        className="cr-composer"
        style={{
          background: 'var(--cr-elev)',
          border: 'none',
          borderRadius: usageDismissed && attachments.length === 0 ? 16 : '0 0 16px 16px',
          padding: '8px 10px 6px',
          boxShadow: '0 18px 44px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <textarea
            ref={composerTextAreaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${clampComposerHeight(e.currentTarget.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Bring the problem. I'll break it down."
            aria-label="Pesan"
            rows={1}
            className="pax-cr-textarea cr-composer-textarea"
            style={{
              width: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--cr-text)',
              fontSize: 15,
              lineHeight: 1.4,
              minHeight: composerTall ? 220 : 22,
              maxHeight: COMMAND_COMPOSER_MAX_HEIGHT,
              caretColor: 'var(--cr-orange)',
            }}
          />
          {draft.length > 80 && (
            <button
              type="button"
              onClick={() => setComposerTall((v) => !v)}
              aria-label={composerTall ? 'Perkecil area ketik' : 'Perbesar area ketik'}
              title={composerTall ? 'Perkecil area ketik' : 'Perbesar area ketik'}
              className="pax-cr-hover pax-press pax-fade"
              style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'var(--cr-panel2)', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
            >
              {composerTall ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>
          )}
        </div>
        <div className="cr-composer-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          {/* + lampiran/konektor */}
          <div ref={plusRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPlusOpen((v) => !v)}
              aria-label="Tambahkan konten"
              aria-expanded={plusOpen}
              aria-haspopup="menu"
              className="pax-cr-hover pax-press cr-plus-button"
              data-open={plusOpen ? 'true' : undefined}
              style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform .2s var(--ease)', transform: plusOpen ? 'rotate(45deg)' : 'none' }}
            >
              <Plus size={14} />
            </button>
            {plusOpen && (
              <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 40, left: 0, width: 224, borderRadius: 13, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 40 }}>
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
                    <span className="pax-mono" style={{ fontSize: 9, color: 'var(--cr-orange)', border: 'none', background: 'var(--cr-orange-soft)', borderRadius: 5, padding: '1px 5px' }}>SOON</span>
                  </button>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.docx,.xlsx,.xls,.pptx,.csv"
              onChange={(e) => { void onPickFiles(e.target.files); e.target.value = ''; }}
              aria-label="Tambah file atau foto"
              style={{ display: 'none' }}
            />
          </div>

          {/* Thinking mode */}
          <button
            type="button"
            onClick={() => setThinking((t) => (t === 'on' ? 'off' : 'on'))}
            disabled={!activeModelDef.supportsThinking}
            className="pax-cr-hover pax-press cr-thinking-toggle"
            title={resolvedThinking === 'on' ? 'Ultra — thinking aktif, jawaban lebih dalam' : 'Standard — respons lebih cepat'}
            style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 8px', borderRadius: 8, border: 'none', background: 'transparent', color: resolvedThinking === 'on' ? 'var(--cr-orange)' : 'var(--cr-text3)', fontSize: 11.5, fontWeight: 600, cursor: activeModelDef.supportsThinking ? 'pointer' : 'default' }}
          >
            <span className="cr-thinking-prefix" aria-hidden="true">Thinking</span>
            <span className="cr-thinking-value">{resolvedThinking === 'on' ? 'Ultra' : 'Standard'}</span>
          </button>

          {activeExecution && (
            <button
              type="button"
              onClick={() => { void chatRunStore.stopRun(activeExecution.runId); }}
              aria-label="Hentikan turn aktif"
              title="Stop turn aktif"
              className="pax-cr-hover pax-press"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 8, border: '1px solid var(--cr-border)', background: 'transparent', color: 'var(--cr-orange)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
          {queuedRuns.length > 0 && (
            <span className="pax-mono" aria-label={`${queuedRuns.length} turn dalam antrian`} style={{ color: 'var(--cr-text3)', fontSize: 10.5, whiteSpace: 'nowrap' }}>
              {queuedRuns.length} antrian
            </span>
          )}
          {queuedRuns.some((run) => run.parked) && active?.id && (
            <button
              type="button"
              onClick={() => chatRunStore.resumeQueued(active.id)}
              className="pax-cr-hover pax-press"
              style={{ height: 26, padding: '0 8px', borderRadius: 8, border: 'none', background: 'var(--cr-orange-soft)', color: 'var(--cr-orange)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              Resume
            </button>
          )}
          <div style={{ flex: 1 }} />

          {/* Badge: model · thinking · effort */}
          <span className="cr-model-badge" title={badgeLabel} style={{ fontSize: 12, color: 'var(--cr-text3)', background: 'var(--cr-panel2)', border: 'none', borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap', fontWeight: 600 }}>
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
              className="pax-cr-hover cr-model-button"
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {activeModelDef.displayName}
              <ChevronDown size={13} style={{ transition: 'transform .2s var(--ease)', transform: modelOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {modelOpen && (
              <div className="cr-model-menu-wrap" data-menu-order={COMMAND_MODEL_MENU_ROWS.join('-')}>
                <div className="pax-scale-in cr-model-menu" role="menu">
                  <button type="button" role="menuitem" className="cr-model-menu-row" onMouseEnter={() => setModelMenuSection('model')} onClick={() => setModelMenuSection('model')}>
                    <span>Model</span><span className="cr-model-menu-value">{activeModelDef.displayName}</span><ChevronRight size={14} />
                  </button>
                  <button type="button" role="menuitem" className="cr-model-menu-row" onMouseEnter={() => setModelMenuSection('effort')} onClick={() => setModelMenuSection('effort')}>
                    <span>Effort</span><span className="cr-model-menu-value">{reasoningEffort === 'high' ? 'High' : 'Max'}</span><ChevronRight size={14} />
                  </button>
                  <button type="button" role="menuitem" className="cr-model-menu-row" onMouseEnter={() => setModelMenuSection('thinking')} onClick={() => setModelMenuSection('thinking')}>
                    <span>Thinking</span><span className="cr-model-menu-value">{resolvedThinking === 'on' ? 'On' : 'Off'}</span><ChevronRight size={14} />
                  </button>
                  <div className="cr-model-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const defaults = getDefaultCommandModelSettings();
                      setModelAlias(defaults.modelAlias);
                      setReasoningEffort(defaults.reasoningEffort);
                      setThinking(defaults.thinking);
                      setModelOpen(false);
                    }}
                    className="cr-model-menu-row cr-model-menu-reset"
                  >
                    <RotateCcw size={14} /><span>Reset to default</span>
                  </button>
                </div>

                <div className="pax-scale-in cr-model-submenu" role="menu" aria-label={`${modelMenuSection} options`}>
                  {modelMenuSection === 'model' && (Object.values(PAAX_MODELS) as (typeof PAAX_MODELS)[keyof typeof PAAX_MODELS][]).map((model) => (
                    <button key={model.id} type="button" role="menuitemradio" aria-checked={modelAlias === model.id} className="cr-model-submenu-row" onClick={() => { setModelAlias(model.id); setThinking(model.defaultThinking); setReasoningEffort(model.defaultReasoningEffort); setModelOpen(false); }}>
                      <span>{model.displayName}</span>{modelAlias === model.id && <Check size={15} />}
                    </button>
                  ))}
                  {modelMenuSection === 'effort' && COMMAND_EFFORT_OPTIONS.map((effort) => (
                    <button key={effort} type="button" role="menuitemradio" aria-checked={reasoningEffort === effort} className="cr-model-submenu-row" onClick={() => { setReasoningEffort(effort); setModelOpen(false); }}>
                      <span>{effort === 'high' ? 'High' : 'Max'}</span>{reasoningEffort === effort && <Check size={15} />}
                    </button>
                  ))}
                  {modelMenuSection === 'thinking' && COMMAND_THINKING_OPTIONS.map((mode) => (
                    <button key={mode} type="button" role="menuitemradio" aria-checked={resolvedThinking === mode} className="cr-model-submenu-row" onClick={() => { setThinking(mode); setModelOpen(false); }}>
                      <span>{mode === 'on' ? 'On' : 'Off'}</span>{resolvedThinking === mode && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={() => showNote('Input suara hadir di rilis berikutnya.')} aria-label="Input suara (mic)" className="pax-cr-hover pax-press cr-icon-button cr-mic-button" style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Mic size={14} />
          </button>
          <button type="button" onClick={() => showNote('Mode voice hadir di rilis berikutnya.')} aria-label="Mode voice" className="pax-cr-hover pax-press cr-icon-button cr-voice-button" style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <AudioLines size={14} />
          </button>
          <button type="submit" aria-label={isBusy ? 'Steer atau masukkan ke antrian' : 'Kirim'} title={isBusy ? 'Teks akan men-steer turn aktif; lampiran masuk antrian' : 'Kirim'} disabled={!draft.trim()} className="pax-press cr-send-button" style={{ width: 28, height: 28, borderRadius: '50%', background: '#a9a9a9', color: '#1c1c1c', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !draft.trim() ? 0.45 : 1, transition: 'opacity .2s var(--ease), transform .16s var(--ease)' }}>
            <ArrowUp size={13} strokeWidth={2.4} />
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="pax-command" data-room-mode={roomMode} style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', borderRadius: 0, overflow: 'hidden' }}>

      <button
        type="button"
        className="cr-mobile-nav-toggle pax-cr-hover pax-press"
        onClick={() => setMobileSidebarOpen((open) => !open)}
        aria-label={mobileSidebarOpen ? 'Tutup navigasi' : 'Buka navigasi'}
        aria-expanded={mobileSidebarOpen}
      >
        {mobileSidebarOpen ? <X size={18} /> : <PanelLeft size={18} />}
      </button>
      {mobileSidebarOpen && (
        <button
          type="button"
          className="cr-mobile-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Tutup navigasi"
        />
      )}

      {/* ══ SIDEBAR ══ */}
      <div
        className="cr-sidebar"
        data-mobile-open={mobileSidebarOpen ? 'true' : undefined}
        style={{
          width: 268,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--cr-panel)',
          borderRight: 'none',
        }}
      >
        {/* Segmented Home / Project */}
        <div className="cr-sidebar-nav" style={{ padding: '6px 8px 1px' }}>
          <div style={{ display: 'flex', background: 'var(--cr-bg)', borderRadius: 11, padding: 3, border: 'none' }}>
            {(['home', 'project'] as SideTab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'home') setOpenProjectId(null); }}
                role="tab"
                aria-selected={effectiveTab === t}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 30,
                  borderRadius: 8,
                  border: 'none',
                  background: effectiveTab === t ? 'var(--cr-elev)' : 'transparent',
                  color: effectiveTab === t ? 'var(--cr-text)' : 'var(--cr-text3)',
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
        <div style={{ padding: '1px 8px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {sideBtn(<Plus size={15} />, 'New Chat', () => newChat(openProjectId))}
          {sideBtn(<Search size={15} />, 'Search', () => setSearchOpen((v) => !v))}
          {searchOpen && (
            <div className="pax-fade" style={{ padding: '2px 10px 6px' }}>
              <input
                autoFocus
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Cari percakapan…"
                aria-label="Cari percakapan"
                style={{ width: '100%', background: 'var(--cr-bg)', border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: 'var(--cr-text)', outline: 'none' }}
              />
            </div>
          )}
          {sideBtn(<History size={15} />, 'Conversation History', () => { setFilterMode('all'); setSidebarSearch(''); })}
        </div>

        {/* Pinned */}
        {pinnedConvs.length > 0 && (
          <div style={{ padding: '1px 8px 0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--cr-text3)', padding: '0 10px 1px' }}>
              Pinned
            </div>
            {pinnedConvs.map((c) => convRow(c))}
          </div>
        )}

        {/* Conversation + filter */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1px 8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px 1px' }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--cr-text3)' }}>
              Conversation
            </span>
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                aria-label="Filter percakapan"
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                title={`Filter: ${filterLabels[filterMode]}`}
                className="pax-cr-hover"
                style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: filterMode !== 'recent' ? 'var(--cr-orange)' : 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Filter size={12} />
              </button>
              {filterOpen && (
                <div className="pax-scale-in" role="menu" style={{ position: 'absolute', top: 26, right: 0, width: 122, borderRadius: 11, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 14px 34px rgba(0,0,0,0.5)', padding: 4, zIndex: 30 }}>
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
        <div ref={profileRef} style={{ position: 'relative', padding: 8 }}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
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
            <div className="pax-scale-in" role="menu" style={{ position: 'absolute', bottom: 52, left: 8, right: 8, borderRadius: 12, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 14px 34px rgba(0,0,0,0.5)', padding: 5, zIndex: 30 }}>
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
        <div
          role="tablist"
          aria-label="Command Room mode"
          style={{ alignSelf: 'center', display: 'flex', gap: 2, padding: 3, margin: '8px 0 0', borderRadius: 999, background: 'var(--cr-panel2)', zIndex: 25 }}
        >
          {(['chat', 'work'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              data-testid={`command-room-mode-${mode}`}
              aria-selected={roomMode === mode}
              onClick={() => setRoomMode(mode)}
              style={{ minWidth: 92, height: 30, padding: '0 18px', border: 'none', borderRadius: 999, background: roomMode === mode ? 'var(--cr-elev)' : 'transparent', color: roomMode === mode ? 'var(--cr-text)' : 'var(--cr-text3)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', transition: 'background .18s var(--cr-ease), color .18s var(--cr-ease)' }}
            >
              {mode === 'chat' ? 'Chat' : 'Work'}
            </button>
          ))}
        </div>

        {roomMode === 'work' ? (
          <CommandRoomWorkSurface />
        ) : (
          <>
        {note && (
          <div className="pax-fade" style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--cr-panel2)', border: 'none', borderRadius: 11, padding: '8px 16px', fontSize: 12, color: 'var(--cr-text)', boxShadow: '0 14px 34px rgba(0,0,0,0.4)' }}>
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
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--cr-panel2)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Cloud size={14} /> Manage Connectors
                      </button>
                      {connectorsOpen && (
                        <div className="pax-scale-in" style={{ position: 'absolute', top: 42, right: 0, width: 232, borderRadius: 13, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 30 }}>
                          {[
                            { icon: <Cloud size={14} />, label: 'Google Drive' },
                            { icon: <Mail size={14} />, label: 'Gmail' },
                            { icon: <HardDrive size={14} />, label: 'Local Files' },
                            { icon: <Github size={14} />, label: 'GitHub' },
                          ].map((c) => (
                            <button key={c.label} onClick={() => { showNote(`Connector ${c.label} untuk project ini hadir di rilis berikutnya.`); setConnectorsOpen(false); }} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                              <span style={{ color: 'var(--cr-text3)', display: 'flex' }}>{c.icon}</span>
                              <span style={{ flex: 1 }}>{c.label}</span>
                              <span className="pax-mono" style={{ fontSize: 9, color: 'var(--cr-orange)', border: 'none', background: 'var(--cr-orange-soft)', borderRadius: 5, padding: '1px 5px' }}>SOON</span>
                            </button>
                          ))}
                          <div style={{ padding: '7px 10px', fontSize: 10.5, color: 'var(--cr-text3)', lineHeight: 1.5, marginTop: 3 }}>
                            Connector hanya berlaku untuk project ini — file project lain tidak tercampur.
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { const conv = createConversation(SCOPE, openProject.id); refresh(conv.id); setTab('home'); }}
                      className="pax-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
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
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: 'none', background: 'var(--cr-panel)', color: 'var(--cr-text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
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
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, border: 'none', background: 'var(--cr-panel2)', color: 'var(--cr-text2)', fontSize: 12, cursor: 'pointer' }}
                    >
                      Sort by <strong style={{ color: 'var(--cr-text)' }}>Last updated</strong> <ChevronDown size={12} />
                    </button>
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="pax-press"
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 10, border: 'none', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      New project
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18, background: 'var(--cr-panel2)', border: 'none', borderRadius: 11, padding: '10px 14px' }}>
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
                    <div className="pax-fade" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 11, background: 'rgba(217,119,87,0.1)', color: 'var(--cr-orange)', fontSize: 12 }}>
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
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, minHeight: 150, padding: '16px 17px', borderRadius: 14, border: 'none', background: 'var(--cr-panel)', cursor: 'pointer', textAlign: 'left', transition: 'border-color .2s var(--ease), background .2s var(--ease)' }}
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
            <div className="cr-header" style={{ padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={14} /></span>
              {renaming ? (
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
                  onBlur={submitRename}
                  aria-label="Ganti judul percakapan"
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--cr-text)', background: 'var(--cr-panel2)', border: 'none', borderRadius: 7, padding: '3px 8px', outline: 'none', minWidth: 160 }}
                />
              ) : (
                <span className="cr-header-title" style={{ fontSize: 14, fontWeight: 600, color: 'var(--cr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {active?.title ?? 'Percakapan'}
                </span>
              )}
              <div ref={titleMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => { setTitleMenuOpen((v) => !v); setMoveSubOpen(false); }}
                  aria-label="Menu percakapan"
                  aria-expanded={titleMenuOpen}
                  aria-haspopup="menu"
                  className="pax-cr-hover pax-press cr-header-icon-button"
                  style={{ width: COMMAND_HEADER_ICON_SIZE, height: COMMAND_HEADER_ICON_SIZE, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <MoreVertical size={14} />
                </button>
                {titleMenuOpen && active && (
                  <div className="pax-scale-in" role="menu" style={{ position: 'absolute', top: 28, left: 0, width: 208, borderRadius: 13, background: 'var(--cr-panel2)', border: 'none', boxShadow: '0 18px 44px rgba(0,0,0,0.5)', padding: 5, zIndex: 45 }}>
                    <button type="button" role="menuitem" onClick={() => { patchServerConversation(active.id, { pinned: !active.pinned }); togglePinned(active.id); refresh(active.id); setTitleMenuOpen(false); }} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: active.pinned ? 'var(--cr-orange)' : 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                       <Pin size={13} /> {active.pinned ? 'Lepas pin' : 'Pin conversation'}
                    </button>
                    <button type="button" role="menuitem" onClick={startRename} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                       <Pencil size={13} /> Rename conversation
                    </button>
                    <button type="button" role="menuitem" onClick={() => { patchServerConversation(active.id, { archived: !active.archived }); toggleArchived(active.id); refresh(null); setTitleMenuOpen(false); }} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                       <History size={13} /> {active.archived ? 'Keluarkan dari arsip' : 'Archive conversation'}
                    </button>
                    <button type="button" role="menuitem" onClick={() => setMoveSubOpen((v) => !v)} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                      <FolderPlus size={13} /> Move to project
                      <span style={{ flex: 1 }} />
                      <ChevronDown size={12} style={{ opacity: 0.6, transition: 'transform .2s var(--ease)', transform: moveSubOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {moveSubOpen && (
                      <div className="pax-fade" style={{ padding: '2px 4px 4px 26px', maxHeight: 160, overflowY: 'auto' }}>
                        {projects.length === 0 && (
                          <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--cr-text3)' }}>Belum ada project.</div>
                        )}
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => { patchServerConversation(active.id, { projectId: project.id }); moveConversation(active.id, project.id); refresh(active.id); setTitleMenuOpen(false); setMoveSubOpen(false); showNote(`Percakapan masuk ke "${project.name}".`); }}
                            className="pax-cr-hover"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 7, border: 'none', background: active.folderId === project.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--cr-text2)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ height: 1, background: 'var(--cr-border)', margin: '4px 8px' }} />
                    <button type="button" role="menuitem" onClick={openNewBranch} className="pax-cr-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--cr-text)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                      <GitBranch size={13} /> Open new branch
                    </button>
                  </div>
                )}
              </div>
              <span style={{ flex: 1 }} />
              <span className="pax-mono" style={{ fontSize: 11, color: 'var(--cr-text3)' }}>PAAX · {activeModelDef.displayName}</span>
              <button
                type="button"
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label="Toggle side panel"
                aria-expanded={sidePanelOpen}
                title="Activity, sources, and summary panel"
                className="pax-cr-hover pax-press cr-header-icon-button"
                style={{ width: COMMAND_HEADER_ICON_SIZE, height: COMMAND_HEADER_ICON_SIZE, borderRadius: 9, border: 'none', background: sidePanelOpen ? 'var(--cr-orange-soft)' : 'transparent', color: sidePanelOpen ? 'var(--cr-orange)' : 'var(--cr-text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <PanelRight size={15} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
            <div ref={scrollRef} className="cr-message-scroll" style={{ flex: 1, overflowY: 'auto', padding: '32px 0' }}>
              <div className="cr-message-list" style={{ maxWidth: 820, margin: '0 auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="pax-rise pax-msg-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div className="cr-user-message" style={{ maxWidth: '82%', background: 'var(--cr-elev)', border: 'none', borderRadius: 18, padding: '12px 16px', fontSize: 15, lineHeight: 1.62, color: 'var(--cr-text)', whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </div>
                      <div className="cr-message-meta" style={{ width: 'min(82%, 680px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="pax-msg-time pax-mono" style={{ fontSize: 12, color: 'var(--cr-text3)' }}>{m.time}</span>
                        {messageActions(m.id, m.text, 'user')}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="pax-rise pax-msg-row" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={13} /></span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cr-text2)' }}>PAAX · {m.model?.displayName ?? activeModelDef.displayName}</span>
                      </div>
                      {m.processing && <ProcessingTrace trace={m.processing} />}
                      {m.parts?.length ? (
                        <ChatPartsRenderer parts={m.parts} sources={m.sources} artifacts={m.artifacts} />
                      ) : (
                        <div className="cr-markdown" style={{ fontSize: 15, lineHeight: 1.68, color: 'var(--cr-text)' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                        </div>
                      )}
                      <div className="cr-message-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {messageActions(m.id, m.text, 'assistant')}
                        <span style={{ flex: 1 }} />
                        <span className="pax-msg-time pax-mono" style={{ fontSize: 12, color: 'var(--cr-text3)' }}>{m.time}</span>
                      </div>
                    </div>
                  ),
                )}
                {active?.branchedFrom && messages.length > 0 && messages[messages.length - 1].id === active.branchedFrom.atMessageId && (
                  <div className="pax-fade" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                    <span style={{ flex: 1, height: 1, background: 'var(--cr-border)' }} />
                    <span style={{ fontSize: 11, color: 'var(--cr-text3)', whiteSpace: 'nowrap' }}>
                      You&apos;re now in a new branch from &ldquo;{active.branchedFrom.sourceTitle}&rdquo;
                    </span>
                    <span style={{ flex: 1, height: 1, background: 'var(--cr-border)' }} />
                  </div>
                )}
                {pendingRuns.map((run) => (
                  <div key={run.runId} className="pax-rise" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ color: 'var(--cr-orange)', display: 'flex' }}><PaaxMark size={13} /></span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cr-text2)' }}>PAAX · {run.modelName}</span>
                    </div>

                    <RunStatus run={run} onStop={() => { void chatRunStore.stopRun(run.runId); }} showStop={false} />
                    {run.messageParts.length ? (
                      <ChatPartsRenderer parts={run.messageParts} sources={run.sources} artifacts={run.artifacts} />
                    ) : (
                      <>
                        {run.answerBuffer && (
                          <div className="cr-markdown" style={{ fontSize: 15, lineHeight: 1.68, color: 'var(--cr-text)' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.answerBuffer}</ReactMarkdown>
                          </div>
                        )}
                      </>
                    )}
                    {run.state === 'queued' && run.parked && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--cr-orange)', fontSize: 11 }}>
                        <Square size={11} /> Antrian diparkir — tekan Resume di composer.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {showScrollToBottom && (
              isBusy ? (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pax-cr-hover pax-press pax-cr-float-btn pax-fade"
                  aria-label="AI sedang menjawab — turun ke jawaban"
                  title="AI sedang menjawab — turun ke jawaban"
                  style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999, border: 'none', background: 'var(--cr-panel2)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 10px 26px rgba(0,0,0,0.35)', zIndex: 20 }}
                >
                  <span aria-hidden="true" style={{ display: 'flex', animation: 'paxpulse 1.4s ease-in-out infinite', letterSpacing: 1 }}>•••</span>
                  Generating…
                </button>
              ) : (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pax-cr-hover pax-press pax-cr-float-btn pax-fade"
                  aria-label="Scroll ke bawah"
                  title="Scroll ke bawah"
                  style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--cr-panel2)', color: 'var(--cr-text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 10px 26px rgba(0,0,0,0.35)', zIndex: 20 }}
                >
                  <ChevronDown size={16} />
                </button>
              )
            )}
            {sidePanelOpen && sidePanel}
            </div>
            <div className="pax-rise cr-composer-wrap" style={{ padding: '10px 22px 18px' }}>
              {composer}
            </div>
          </>
        ) : (
          /* ── HERO AWAL ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 22px 96px' }}>
            <div className="cr-empty-hero pax-rise">
              <h1>What are we solving?</h1>
              <p>Mulai dari pertanyaan, dokumen, atau konteks lapangan.</p>
            </div>
            <div className="pax-rise cr-new-task-panel" style={{ width: '100%' }}>
              {composer}
            </div>
          </div>
        )}
          </>
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
          <div className="pax-scale-in" style={{ width: 520, maxWidth: '100%', background: 'var(--cr-panel)', border: 'none', borderRadius: 16, padding: '22px 24px', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
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
              style={{ width: '100%', background: 'var(--cr-bg)', border: 'none', borderRadius: 10, padding: '11px 13px', fontSize: 13, color: 'var(--cr-text)', outline: 'none', marginBottom: 16 }}
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
              style={{ width: '100%', background: 'var(--cr-bg)', border: 'none', borderRadius: 10, padding: '11px 13px', fontSize: 13, color: 'var(--cr-text)', outline: 'none', resize: 'vertical', lineHeight: 1.55 }}
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
                style={{ padding: '9px 17px', borderRadius: 10, border: 'none', background: 'var(--cr-elev)', color: 'var(--cr-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: newName.trim() && !creatingProject ? 1 : 0.5, transition: 'opacity .2s var(--ease)' }}
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
