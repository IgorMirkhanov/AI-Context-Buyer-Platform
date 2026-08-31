import { AnthropicOptimizationLlm } from "./anthropic-llm";
import { HeuristicOptimizationLlm } from "./llm";
import { OptimizationWriter } from "./types";

export type OptimizationLlmMode = "anthropic" | "heuristic";

export const OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE =
  "Optimization Agent: ИИ-провайдер не настроен — используется heuristic fallback (шаблонные формулировки rationale).";

export type ResolveOptimizationLlmOptions = {
  apiKey?: string | null;
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
  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    return {
      writer: new AnthropicOptimizationLlm({
        apiKey,
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
