import type { AiProviderName } from "../llm/credentials";
import {
  AgentLlmMode,
  pickAgentLlmProvider,
} from "../llm/resolve-agent-llm";
import { HeuristicAnalysisWriter } from "./heuristic-llm";
import {
  createAnthropicAnalysisChat,
  createGeminiAnalysisChat,
  createGroqAnalysisChat,
  RemoteAnalysisWriter,
} from "./remote-analysis-llm";
import type { AnalysisWriter } from "./types";

export type AnalysisLlmMode = AgentLlmMode;

export const ANALYSIS_HEURISTIC_FALLBACK_MESSAGE =
  "Analysis Agent: ИИ-провайдер не настроен — используется краткая сводка по брифу без LLM.";

export const ANALYSIS_UNSUPPORTED_PROVIDER_MESSAGE = (provider: string) =>
  `Analysis Agent: провайдер «${provider}» не поддерживается для анализа — используется heuristic fallback.`;

export type ResolveAnalysisLlmOptions = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  model?: string;
  fetchImpl?: typeof fetch;
  onFallback?: (message: string) => void;
};

export type ResolveAnalysisLlmResult = {
  writer: AnalysisWriter;
  mode: AnalysisLlmMode;
};

export function resolveAnalysisLlm(
  options: ResolveAnalysisLlmOptions,
): ResolveAnalysisLlmResult {
  const picked = pickAgentLlmProvider({
    apiKey: options.apiKey,
    provider: options.provider,
    onFallback: options.onFallback,
    unsupportedProviderMessage: ANALYSIS_UNSUPPORTED_PROVIDER_MESSAGE,
  });
  if (picked?.provider === "gemini") {
    return {
      writer: new RemoteAnalysisWriter(
        createGeminiAnalysisChat({
          apiKey: picked.apiKey,
          model: options.model,
          fetchImpl: options.fetchImpl,
        }),
      ),
      mode: "gemini",
    };
  }
  if (picked?.provider === "groq") {
    return {
      writer: new RemoteAnalysisWriter(
        createGroqAnalysisChat({
          apiKey: picked.apiKey,
          model: options.model,
          fetchImpl: options.fetchImpl,
        }),
      ),
      mode: "groq",
    };
  }
  if (picked?.provider === "anthropic") {
    return {
      writer: new RemoteAnalysisWriter(
        createAnthropicAnalysisChat({
          apiKey: picked.apiKey,
          model: options.model,
          fetchImpl: options.fetchImpl,
        }),
      ),
      mode: "anthropic",
    };
  }
  options.onFallback?.(ANALYSIS_HEURISTIC_FALLBACK_MESSAGE);
  return {
    writer: new HeuristicAnalysisWriter(),
    mode: "heuristic",
  };
}
