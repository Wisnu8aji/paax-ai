/**
 * Riwayat Engineering Chat per proyek — disimpan lokal di peramban.
 *
 * Ini murni STATE TAMPILAN (riwayat & pengelompokan percakapan), bukan jalur
 * angka: jawaban AI tetap datang dari /api/ai/chat dan angka dari Core Engine.
 * Skema: percakapan bisa berdiri sendiri atau dikelompokkan ke "Project
 * Percakapan" (folder) — pola yang sama dengan ChatGPT/Claude Projects.
 */

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Label jam tampilan (HH:mm) */
  time: string;
}

export interface ChatConversation {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatFolder {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

interface ChatHistoryState {
  conversations: ChatConversation[];
  folders: ChatFolder[];
}

const STORAGE_KEY = 'paax-chat-history-v1';
const EMPTY: ChatHistoryState = { conversations: [], folders: [] };

function load(): ChatHistoryState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ChatHistoryState>;
    return {
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
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

export function createConversation(projectId: string, folderId: string | null = null): ChatConversation {
  const now = new Date().toISOString();
  const conversation: ChatConversation = {
    id: newId('conv'),
    projectId,
    folderId,
    title: 'Percakapan baru',
    messages: [],
    createdAt: now,
    updatedAt: now,
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
  conv.updatedAt = new Date().toISOString();
  save(state);
}

export function createFolder(projectId: string, name: string): ChatFolder {
  const folder: ChatFolder = {
    id: newId('folder'),
    projectId,
    name: name.trim() || 'Project baru',
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
