import type { AppConfig, ModelProfile } from "../../config";
import type { ProviderTransport } from "../base";
import { ProviderError } from "../errors";
import { OpenAICompatibleTransport } from "./openai-compatible";
import { ResponsesTransport } from "./responses";
import { GeminiTransport } from "./gemini";
import type { FetchImplementation } from "./shared";

export { OpenAICompatibleTransport } from "./openai-compatible";
export { ResponsesTransport } from "./responses";
export { GeminiTransport } from "./gemini";
export type { FetchImplementation } from "./shared";

export function createProviderTransport(profile: ModelProfile, config: AppConfig, fetchImpl: FetchImplementation = fetch): ProviderTransport {
  if (profile.provider === "gemini" && profile.transport === "native") {
    if (!config.enableOptionalGemini) throw new ProviderError("provider_transport_unavailable", "optional Gemini transport is disabled", 503, false);
    return new GeminiTransport(profile, config, fetchImpl);
  }
  if (profile.transport !== "openai-compatible") throw new ProviderError("provider_transport_unavailable", "provider transport is unavailable for the canonical loop", 503, false);
  if (profile.requestStyle === "chat-completions") return new OpenAICompatibleTransport(profile, config, fetchImpl);
  if (profile.requestStyle === "responses") return new ResponsesTransport(profile, config, fetchImpl);
  throw new ProviderError("provider_configuration_invalid", "provider request style is invalid", 503, false);
}
