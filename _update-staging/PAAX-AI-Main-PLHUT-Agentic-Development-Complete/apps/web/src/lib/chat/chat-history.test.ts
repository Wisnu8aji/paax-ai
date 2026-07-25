import { afterEach, describe, expect, it, vi } from "vitest";

import {
  branchConversation,
  createConversation,
  listConversations,
  moveConversation,
  renameConversation,
  saveConversation,
  setConversationConnectors,
  titleFromMessage,
  toggleArchived,
  togglePinned,
} from "./chat-history";

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
}

describe("chat history conversation flags", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates conversations with pin and archive flags disabled", () => {
    installLocalStorage();

    const conversation = createConversation("project-1");

    expect(conversation.pinned).toBe(false);
    expect(conversation.archived).toBe(false);
  });

  it("toggles pinned and archived flags in storage", () => {
    installLocalStorage();
    const conversation = createConversation("project-1");

    togglePinned(conversation.id);
    toggleArchived(conversation.id);

    const [stored] = listConversations("project-1");
    expect(stored.pinned).toBe(true);
    expect(stored.archived).toBe(true);
  });

  it("creates a concise title from the first message", () => {
    expect(titleFromMessage("  Audit   struktur gedung kantor lima lantai  ")).toBe(
      "Audit struktur gedung kantor lima lantai",
    );
    expect(titleFromMessage("x".repeat(60))).toBe(`${"x".repeat(46)}…`);
  });

  it("persists rename, project move, and all connector states", () => {
    installLocalStorage();
    const conversation = createConversation("command-room");

    renameConversation(conversation.id, "Audit struktur");
    moveConversation(conversation.id, "project-2");
    setConversationConnectors(conversation.id, {
      gambarKerja: true,
      rab: true,
      jadwal: true,
    });

    const [stored] = listConversations("command-room");
    expect(stored.title).toBe("Audit struktur");
    expect(stored.folderId).toBe("project-2");
    expect(stored.connectors).toEqual({
      gambarKerja: true,
      rab: true,
      jadwal: true,
    });
  });

  it("branches a conversation with copied history and independent connectors", () => {
    installLocalStorage();
    const source = createConversation("command-room", "project-1");
    source.title = "Analisa RAB";
    source.messages = [
      { id: "message-1", role: "user", text: "Hitung RAB", time: "09.00" },
    ];
    source.connectors = { gambarKerja: true, rab: true, jadwal: false };
    saveConversation(source);

    const branch = branchConversation(source.id);
    expect(branch).not.toBeNull();
    expect(branch?.title).toBe("branch-Analisa RAB");
    expect(branch?.messages).toEqual(source.messages);
    expect(branch?.messages).not.toBe(source.messages);
    expect(branch?.messages[0]).not.toBe(source.messages[0]);
    expect(branch?.connectors).toEqual(source.connectors);
    expect(branch?.connectors).not.toBe(source.connectors);
    expect(branch?.branchedFrom).toEqual({ sourceTitle: "Analisa RAB", atMessageId: "message-1" });
  });
});
