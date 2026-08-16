"use client";

import { useSyncExternalStore } from "react";
import { workAgentStore } from "./work-agent-store";

export function useWorkAgentStore() {
  return useSyncExternalStore(
    workAgentStore.subscribe,
    workAgentStore.getSnapshot,
    workAgentStore.getSnapshot,
  );
}

export function useWorkAgent(sessionId: string | null) {
  const snapshot = useWorkAgentStore();
  return sessionId ? snapshot.sessionsById[sessionId] ?? null : null;
}
