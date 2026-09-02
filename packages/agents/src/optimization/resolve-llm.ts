import { AnthropicOptimizationLlm } from "./anthropic-llm";
import { GeminiOptimizationLlm } from "./gemini-llm";
import { GroqOptimizationLlm } from "./groq-llm";
import { HeuristicOptimizationLlm } from "./llm";
import { OptimizationWriter } from "./types";
import type { AiProviderName } from "../llm/credentials";
import {
  AgentLlmMode,
  pickAgentLlmProvider,
} from "../llm/resolve-agent-llm";

export type OptimizationLlmMode = AgentLlmMode;

export const OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE =
  "Optimization Agent: ИИ-провайдер не настроен — используется heuristic fallback (шаблонные формулировки rationale).";

export const OPTIMIZATION_UNSUPPORTED_PROVIDER_MESSAGE = (provider: string) =>
  `Optimization Agent: провайдер «${provider}» не поддерживается для оптимизации — используется heuristic fallback.`;

export type ResolveOptimizationLlmOptions = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  model?: string;
  fetchImpl?: typeof fetch;
  onFallback?: (message: string) => void;
};

export type ResolveOptimizationLlmResult = {
  writer: OptimizationWriter;
  mode: OptimizationLlmMode;
};

export function resolveOptimizationLlm(
  options: ResolveOptimizationLlmOptions,
): ResolveOptimizationLlmResult {
  const picked = pickAgentLlmProvider({
    apiKey: options.apiKey,
    provider: options.provider,
    onFallback: options.onFallback,
    unsupportedProviderMessage: OPTIMIZATION_UNSUPPORTED_PROVIDER_MESSAGE,
  });
  if (picked?.provider === "gemini") {
    return {
      writer: new GeminiOptimizationLlm({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
      }),
      mode: "gemini",
    };
  }
  if (picked?.provider === "groq") {
    return {
      writer: new GroqOptimizationLlm({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
      }),
      mode: "groq",
    };
  }
  if (picked?.provider === "anthropic") {
    return {
      writer: new AnthropicOptimizationLlm({
        apiKey: picked.apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
      }),
      mode: "anthropic",
    };
  }
  options.onFallback?.(OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE);
  return {
    writer: new HeuristicOptimizationLlm(),
    mode: "heuristic",
  };
}
