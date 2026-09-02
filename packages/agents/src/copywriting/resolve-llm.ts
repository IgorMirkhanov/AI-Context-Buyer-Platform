import { AnthropicCopywriter } from "./anthropic-copywriter";
import { GeminiCopywriter } from "./gemini-copywriter";
import { GroqCopywriter } from "./groq-copywriter";
import { Copywriter, HeuristicCopywriter } from "./generate";
import type { AiProviderName } from "../llm/credentials";
import {
  AgentLlmMode,
  pickAgentLlmProvider,
} from "../llm/resolve-agent-llm";

export type CopywritingLlmMode = AgentLlmMode;

export const COPYWRITING_HEURISTIC_FALLBACK_MESSAGE =
  "Copywriting Agent: ИИ-провайдер не настроен — используется heuristic fallback (шаблонные объявления без LLM).";

export const COPYWRITING_UNSUPPORTED_PROVIDER_MESSAGE = (provider: string) =>
  `Copywriting Agent: провайдер «${provider}» не поддерживается для копирайтинга — используется heuristic fallback.`;

export type ResolveCopywritingLlmOptions = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  model?: string;
  fetchImpl?: typeof fetch;
  onFallback?: (message: string) => void;
  onLlmCall?: (usage: import("../semantic/types").LlmUsage) => void | Promise<void>;
};

export type ResolveCopywritingLlmResult = {
  writer: Copywriter;
  mode: CopywritingLlmMode;
};

export function resolveCopywritingLlm(
  options: ResolveCopywritingLlmOptions,
): ResolveCopywritingLlmResult {
  const picked = pickAgentLlmProvider({
    apiKey: options.apiKey,
    provider: options.provider,
    onFallback: options.onFallback,
    unsupportedProviderMessage: COPYWRITING_UNSUPPORTED_PROVIDER_MESSAGE,
  });
  if (picked?.provider === "gemini") {
    return {
      writer: new GeminiCopywriter({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
        onLlmCall: options.onLlmCall,
      }),
      mode: "gemini",
    };
  }
  if (picked?.provider === "groq") {
    return {
      writer: new GroqCopywriter({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
        onLlmCall: options.onLlmCall,
      }),
      mode: "groq",
    };
  }
  if (picked?.provider === "anthropic") {
    return {
      writer: new AnthropicCopywriter({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
        onLlmCall: options.onLlmCall,
      }),
      mode: "anthropic",
    };
  }
  options.onFallback?.(COPYWRITING_HEURISTIC_FALLBACK_MESSAGE);
  return {
    writer: new HeuristicCopywriter(),
    mode: "heuristic",
  };
}
