/** Google AI Studio OpenAI-compatible endpoint (trailing slash required). */
export const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

/**
 * Cheap/fast Flash model for agent steps. Model IDs evolve — override via
 * QA_RECORD_MODEL or per-call `model` option. See Google AI Studio models list.
 * As of 2026-08, gemini-2.0-flash is retired for new API keys; use 3.x Flash.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
