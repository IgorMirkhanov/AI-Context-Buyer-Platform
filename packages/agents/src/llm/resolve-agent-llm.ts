import type { AiProviderName } from "../llm/credentials";

export type AgentLlmProvider = Extract<
  AiProviderName,
  "anthropic" | "groq" | "gemini"
>;

export type AgentLlmMode = AgentLlmProvider | "heuristic";

export type ResolveAgentLlmInput = {
  apiKey?: string | null;
  provider?: AiProviderName | null;
  onFallback?: (message: string) => void;
  unsupportedProviderMessage: (provider: string) => string;
};

export function pickAgentLlmProvider(
  input: ResolveAgentLlmInput,
): { apiKey: string; provider: AgentLlmProvider } | null {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    return null;
  }
  const provider = input.provider ?? "anthropic";
  if (
    provider === "anthropic" ||
    provider === "groq" ||
    provider === "gemini"
  ) {
    return { apiKey, provider };
  }
  input.onFallback?.(input.unsupportedProviderMessage(provider));
  return null;
}
