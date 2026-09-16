import type { AgentLlmProvider } from "../llm/resolve-agent-llm";

/**
 * Default models for Semantic Agent JSON steps (intent, negatives, cluster names).
 * Override via ResolveSemanticLlmOptions.model or QA_RECORD_MODEL in scripts.
 */
export const SEMANTIC_DEFAULT_MODEL: Record<AgentLlmProvider, string> = {
  /** Lite tier: fewer 429 on free Google AI Studio keys vs full Flash. */
  gemini: "gemini-flash-lite-latest",
  /** 70B: better Russian commercial/intent nuance than llama-3.1-8b-instant. */
  groq: "llama-3.3-70b-versatile",
  /** Haiku: structured JSON at lower cost than Sonnet for classification steps. */
  anthropic: "claude-3-5-haiku-20241022",
};

export function defaultSemanticModel(provider: AgentLlmProvider): string {
  return SEMANTIC_DEFAULT_MODEL[provider];
}
