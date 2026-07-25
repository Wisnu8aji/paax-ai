import type { ActivityEventPayload } from "./activity-timeline";

export type RunPhase =
  | "queued"
  | "receiving_message"
  | "loading_conversation"
  | "loading_project_context"
  | "preparing_prompt"
  | "calling_model"
  | "waiting_for_model"
  | "receiving_reasoning"
  | "receiving_first_tokens"
  | "streaming_response"
  | "using_tool"
  | "saving_response"
  | "updating_conversation"
  | "completed"
  | "failed"
  | "cancelled"
  | "reasoning_summary";

export type CommandRoomStreamEvent =
  | {
      type: "status";
      runId: string;
      conversationId: string;
      phase: RunPhase;
      statusLabel: string;
      statusDetail?: string;
      timestamp: string;
    }
  | {
      type: "reasoning";
      runId: string;
      conversationId: string;
      delta: string;
      timestamp: string;
    }
  | {
      type: "content";
      runId: string;
      conversationId: string;
      delta: string;
      timestamp: string;
    }
  | {
      type: "error";
      runId: string;
      conversationId: string;
      errorMessage: string;
      timestamp: string;
    }
  | {
      type: "activity";
      runId: string;
      conversationId: string;
      activity: ActivityEventPayload;
      timestamp: string;
    }
  | {
      type: "tool_call";
      runId: string;
      conversationId: string;
      tool: string;
      toolCallId?: string;
      timestamp: string;
    }
  | {
      type: "tool_result";
      runId: string;
      conversationId: string;
      tool: string;
      toolCallId?: string;
      summary?: string;
      timestamp: string;
    }
  | {
      type: "done";
      runId: string;
      conversationId: string;
      timestamp: string;
    };
