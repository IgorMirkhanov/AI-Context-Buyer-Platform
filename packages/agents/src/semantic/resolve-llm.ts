import { AnthropicSemanticLlm } from "./anthropic-llm";
import { GeminiSemanticLlm } from "./gemini-llm";
import { GroqSemanticLlm } from "./groq-llm";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";
import type { AiProviderName } from "../llm/credentials";
import {
  AgentLlmMode,
  pickAgentLlmProvider,
} from "../llm/resolve-agent-llm";
import { defaultSemanticModel } from "./semantic-defaults";

export type SemanticLlmMode = AgentLlmMode;

export const SEMANTIC_HEURISTIC_FALLBACK_MESSAGE =
  "Semantic Agent: ИИ-провайдер не настроен — используется heuristic fallback (без LLM near-intent подсказок).";

export const SEMANTIC_UNSUPPORTED_PROVIDER_MESSAGE = (provider: string) =>
  `Semantic Agent: провайдер «${provider}» не поддерживается для семантики — используется heuristic fallback.`;

export type ResolveSemanticLlmOptions = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  model?: string;
  fetchImpl?: typeof fetch;
  onFallback?: (message: string) => void;
};

export type ResolveSemanticLlmResult = {
  llm: SemanticLlm;
  mode: SemanticLlmMode;
};

export function resolveSemanticLlm(
  options: ResolveSemanticLlmOptions,
): ResolveSemanticLlmResult {
  const picked = pickAgentLlmProvider({
    apiKey: options.apiKey,
    provider: options.provider,
    onFallback: options.onFallback,
    unsupportedProviderMessage: SEMANTIC_UNSUPPORTED_PROVIDER_MESSAGE,
  });
  if (picked?.provider === "gemini") {
    return {
      llm: new GeminiSemanticLlm({
        apiKey: picked.apiKey,
        model: options.model ?? defaultSemanticModel("gemini"),
        fetchImpl: options.fetchImpl,
      }),
      mode: "gemini",
    };
  }
  if (picked?.provider === "groq") {
    return {
      llm: new GroqSemanticLlm({
        apiKey: picked.apiKey,
        model: options.model ?? defaultSemanticModel("groq"),
        fetchImpl: options.fetchImpl,
      }),
      mode: "groq",
    };
  }
  if (picked?.provider === "anthropic") {
    return {
      llm: new AnthropicSemanticLlm({
        apiKey: picked.apiKey,
        model: options.model ?? defaultSemanticModel("anthropic"),
        fetchImpl: options.fetchImpl,
      }),
      mode: "anthropic",
    };
  }
  options.onFallback?.(SEMANTIC_HEURISTIC_FALLBACK_MESSAGE);
  return {
    llm: new HeuristicSemanticLlm(),
    mode: "heuristic",
  };
}
