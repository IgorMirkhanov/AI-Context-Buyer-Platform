/** Google AI Studio OpenAI-compatible endpoint (trailing slash required). */
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

/**
 * Cheap/fast Flash model for agent steps. Model IDs evolve — override via
 * QA_RECORD_MODEL or per-call `model` option. See Google AI Studio models list.
 * Prefer *-lite / flash-lite-latest: full Flash often hits free-tier 429 →
 * silent heuristic fallback in RemoteSemanticLlm.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-flash-lite-latest";
