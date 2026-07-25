import { useSyncExternalStore, useMemo } from "react";
import { chatRunStore, type ActiveRun } from "./chat-run-store";

export function useChatRuns(conversationId: string | null): ActiveRun[] {
  const state = useSyncExternalStore(
    chatRunStore.subscribe,
    chatRunStore.getSnapshot,
    chatRunStore.getSnapshot
  );

  return useMemo(() => {
    if (!conversationId) return [];
    const runIds = state.activeRunIdsByConversationId[conversationId] || [];
    return runIds.map((id) => state.runsById[id]).filter(Boolean);
  }, [state, conversationId]);
}

export function useActiveChatRuns(conversationId: string | null): ActiveRun[] {
  const runs = useChatRuns(conversationId);
  return useMemo(() => {
    return runs.filter(
      (r) => r.state === "queued" || r.state === "running" || r.state === "streaming"
    );
  }, [runs]);
}
