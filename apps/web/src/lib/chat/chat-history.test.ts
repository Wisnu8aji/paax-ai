import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConversation,
  listConversations,
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
});
