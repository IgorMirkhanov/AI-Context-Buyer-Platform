import { parseJsonFromLlm } from "./anthropic-client";

/**
 * Gemini via the OpenAI-compatible endpoint is less strict about JSON-only
 * replies: short preambles ("Here is the JSON:") and unclosed markdown fences
 * appear more often than with Groq. Anthropic/Groq keep using parseJsonFromLlm.
 */
export function parseJsonFromGeminiLlm<T>(text: string): T | null {
  const direct = parseJsonFromLlm<T>(text);
  if (direct) {
    return direct;
  }
  const withoutFenceTail = text.replace(/```\s*$/g, "").trim();
  const fromFence = parseJsonFromLlm<T>(withoutFenceTail);
  if (fromFence) {
    return fromFence;
  }
  const jsonStart = withoutFenceTail.search(/[{[]/);
  if (jsonStart > 0) {
    return parseJsonFromLlm<T>(withoutFenceTail.slice(jsonStart));
  }
  return null;
}
