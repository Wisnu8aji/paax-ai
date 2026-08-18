import type { ModelProfile } from "../config";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: readonly ProviderToolCall[];
}

export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: Readonly<Record<string, unknown>>;
}

export interface ProviderTool {
  name: string;
  description?: string;
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface ProviderRequest {
  profile: ModelProfile;
  systemPrompt: string;
  messages: readonly ProviderMessage[];
  tools: readonly ProviderTool[];
  reasoningEffort: string;
  thinking: "on" | "off";
  signal?: AbortSignal;
}

export interface ProviderCompletion {
  content: string | null;
  toolCalls?: readonly ProviderToolCall[];
  reasoning?: string;
  finishReason?: string;
  usage?: Readonly<Record<string, number>>;
}

export type ProviderEvent =
  | { type: "delta"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "completed"; completion: ProviderCompletion }
  | { type: "error"; message: string };

export interface ProviderTransport {
  readonly id: string;
  readonly capabilities: ReadonlySet<string>;
  complete(request: ProviderRequest): Promise<ProviderCompletion>;
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}
