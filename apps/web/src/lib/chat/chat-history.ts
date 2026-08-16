/**
 * Riwayat percakapan Command Room — cache browser dengan server sebagai sumber
 * durable ketika adapter tersedia.
 *
 * Ini murni STATE TAMPILAN (riwayat & pengelompokan percakapan), bukan jalur
 * angka: jawaban AI tetap datang dari /api/command-room/chat dan angka dari
 * Core Engine. Skema: percakapan bisa berdiri sendiri atau dikelompokkan ke
 * "Project Percakapan" (folder) — pola yang sama dengan workspace percakapan.
 */

import type { ChatArtifactRef, ChatSourceRef } from "./command-room-chat-contract";
import type { OrderedMessagePart } from "./command-room-chat-reducer";

export interface StoredProcessingStep {
  id: string;
  kind: 'inspect' | 'context' | 'search' | 'graph' | 'tool' | 'reason' | 'verify' | 'compose' | 'save' | 'warning' | 'complete';
  label: string;
  detail?: string;
  state: 'active' | 'completed' | 'warning' | 'failed';
  startedAt: string;
  completedAt?: string;
}

export interface StoredProcessingTrace {
  modelName: string;
  durationMs: number;
  durationLabel: string;
  steps: StoredProcessingStep[];
}

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Label jam tampilan (HH:mm) */
  time: string;
  /** Ringkasan aktivitas yang aman ditampilkan; bukan chain-of-thought mentah. */
  processing?: StoredProcessingTrace;
  /** Ordered visible parts are the v1.5 transcript; `text` remains a fallback projection. */
  parts?: OrderedMessagePart[];
  model?: { alias: string; displayName: string; provider?: string; providerModel?: string };
  sources?: ChatSourceRef[];
  artifacts?: ChatArtifactRef[];
  turnId?: string;
  status?: 'completed' | 'failed' | 'interrupted';
}

export interface ConversationConnectors {
  gambarKerja: boolean;
  rab: boolean;
  jadwal: boolean;
}

const EMPTY_CONNECTORS: ConversationConnectors = { gambarKerja: false, rab: false, jadwal: false };

export interface ChatConversation {
  id: string;
  projectId: string;
  folderId: string | null;
  /** Canonical project context. Independent from connector toggles and presentation folders. */
  boundProjectId: string | null;
  title: string;
  messages: StoredChatMessage[];
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Sumber data proyek yang diikutsertakan sebagai konteks percakapan ini. */
  connectors: ConversationConnectors;
  /** Diisi kalau percakapan ini adalah hasil "Open new branch" dari percakapan lain. */
  branchedFrom?: { sourceTitle: string; atMessageId: string } | null;
  /** Server sync is explicit; `cache` means the browser copy is not durable. */
  persistence?: 'server' | 'cache';
}

export interface ChatFolder {
  id: string;
  projectId: string;
  name: string;
  /** Deskripsi/goal project percakapan (modal "Create a project", Command Room). */
  description?: string;
  createdAt: string;
}

interface ChatHistoryState {
  conversations: ChatConversation[];
  folders: ChatFolder[];
}

const STORAGE_KEY = 'paax-chat-history-v1';
const EMPTY: ChatHistoryState = { conversations: [], folders: [] };

function normalizeConversation(raw: Partial<ChatConversation>): ChatConversation | null {
  if (!raw.id || !raw.projectId) return null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    projectId: raw.projectId,
    folderId: raw.folderId ?? null,
    boundProjectId: raw.boundProjectId ?? raw.folderId ?? null,
    title: raw.title ?? 'Percakapan baru',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    pinned: raw.pinned ?? false,
    archived: raw.archived ?? false,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    connectors: { ...EMPTY_CONNECTORS, ...raw.connectors },
    branchedFrom: raw.branchedFrom ?? null,
    persistence: raw.persistence ?? 'cache',
  };
}

function load(): ChatHistoryState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ChatHistoryState>;
    return {
      conversations: Array.isArray(parsed.conversations)
        ? parsed.conversations.map((c) => normalizeConversation(c)).filter((c): c is ChatConversation => Boolean(c))
        : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    };
  } catch {
    return EMPTY;
  }
}

function save(state: ChatHistoryState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* kuota penuh / private mode — riwayat sesi ini saja */
  }
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // Server DB conversations use UUID primary keys. Keep folder IDs readable,
    // but make new conversation IDs directly portable to the server adapter.
    return prefix === 'conv' ? crypto.randomUUID() : `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function listConversations(projectId: string): ChatConversation[] {
  return load()
    .conversations.filter((c) => c.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listFolders(projectId: string): ChatFolder[] {
  return load()
    .folders.filter((f) => f.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createConversation(projectId: string, folderId: string | null = null, boundProjectId: string | null = folderId): ChatConversation {
  const now = new Date().toISOString();
  const conversation: ChatConversation = {
    id: newId('conv'),
    projectId,
    folderId,
    boundProjectId,
    title: 'Percakapan baru',
    messages: [],
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    // Project binding is presentation/context scope only. Chat v1.5 does not
    // activate Work connectors from a project-bound conversation.
    connectors: { ...EMPTY_CONNECTORS },
    persistence: 'cache',
  };
  const state = load();
  state.conversations.push(conversation);
  save(state);
  return conversation;
}

export function saveConversation(conversation: ChatConversation): void {
  const state = load();
  const idx = state.conversations.findIndex((c) => c.id === conversation.id);
  const next = { ...conversation, updatedAt: new Date().toISOString() };
  if (idx >= 0) state.conversations[idx] = next;
  else state.conversations.push(next);
  save(state);
}

export function deleteConversation(id: string): void {
  const state = load();
  state.conversations = state.conversations.filter((c) => c.id !== id);
  save(state);
}

export function moveConversation(id: string, folderId: string | null): void {
  const state = load();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.folderId = folderId;
  conv.boundProjectId = folderId;
  conv.updatedAt = new Date().toISOString();
  save(state);
}

export function togglePinned(id: string): void {
  const state = load();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  conv.updatedAt = new Date().toISOString();
  save(state);
}

export function toggleArchived(id: string): void {
  const state = load();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.archived = !conv.archived;
  conv.updatedAt = new Date().toISOString();
  save(state);
}

export function renameConversation(id: string, title: string): void {
  const state = load();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  conv.title = trimmed;
  conv.updatedAt = new Date().toISOString();
  save(state);
}

export function setConversationConnectors(id: string, connectors: Partial<ConversationConnectors>): void {
  const state = load();
  const conv = state.conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.connectors = { ...EMPTY_CONNECTORS, ...conv.connectors, ...connectors };
  conv.updatedAt = new Date().toISOString();
  save(state);
}

/** Fork percakapan dari titik ini ke chat baru — riwayat ter-copy, judul "branch-<judul asal>". */
export function branchConversation(id: string): ChatConversation | null {
  const state = load();
  const source = state.conversations.find((c) => c.id === id);
  if (!source) return null;
  const now = new Date().toISOString();
  const lastMessage = source.messages[source.messages.length - 1];
  const branch: ChatConversation = {
    ...source,
    id: newId('conv'),
    title: `branch-${source.title}`,
    messages: source.messages.map((m) => ({ ...m })),
    connectors: { ...source.connectors },
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    branchedFrom: lastMessage ? { sourceTitle: source.title, atMessageId: lastMessage.id } : null,
  };
  state.conversations.push(branch);
  save(state);
  return branch;
}

export function createFolder(projectId: string, name: string, description = ''): ChatFolder {
  const folder: ChatFolder = {
    id: newId('folder'),
    projectId,
    name: name.trim() || 'Project baru',
    description: description.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const state = load();
  state.folders.push(folder);
  save(state);
  return folder;
}

export function deleteFolder(id: string): void {
  const state = load();
  state.folders = state.folders.filter((f) => f.id !== id);
  // Percakapan di dalam folder tidak dihapus — dilepas jadi berdiri sendiri.
  state.conversations = state.conversations.map((c) => (c.folderId === id ? { ...c, folderId: null } : c));
  save(state);
}

/** Judul otomatis dari pesan pertama pengguna. */
export function titleFromMessage(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 46 ? `${clean.slice(0, 46)}…` : clean || 'Percakapan baru';
}
