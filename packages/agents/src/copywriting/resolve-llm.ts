import { AnthropicCopywriter } from "./anthropic-copywriter";
import { Copywriter, HeuristicCopywriter } from "./generate";

export type CopywritingLlmMode = "anthropic" | "heuristic";

export const COPYWRITING_HEURISTIC_FALLBACK_MESSAGE =
  "Copywriting Agent: ИИ-провайдер не настроен — используется heuristic fallback (шаблонные объявления без LLM).";

export type ResolveCopywritingLlmOptions = {
  apiKey?: string | null;
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
  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    return {
      writer: new AnthropicCopywriter({
        apiKey,
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
