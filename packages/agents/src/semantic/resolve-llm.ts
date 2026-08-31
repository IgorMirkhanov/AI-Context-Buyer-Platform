import { AnthropicSemanticLlm } from "./anthropic-llm";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";

export type SemanticLlmMode = "anthropic" | "heuristic";

export const SEMANTIC_HEURISTIC_FALLBACK_MESSAGE =
  "Semantic Agent: ИИ-провайдер не настроен — используется heuristic fallback (без LLM near-intent подсказок).";

export type ResolveSemanticLlmOptions = {
  apiKey?: string | null;
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
  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    return {
      llm: new AnthropicSemanticLlm({
        apiKey,
        model: options.model,
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
