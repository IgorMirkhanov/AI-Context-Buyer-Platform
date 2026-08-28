import {
  containsForbidden,
  sanitizeForbidden,
} from "../copywriting/limits";
import {
  MediaClusterInput,
  MediaKind,
  MediaMarketing,
  MediaPromptWriter,
} from "./types";

const IMAGE_SIZE = { width: 1024, height: 1024 };
const VIDEO_SIZE = { width: 1280, height: 720 };
const VIDEO_DURATION_MS = 5000;
const PROMPT_MAX = 1500;

/** Детерминированный автор промптов (мок LLM): УТП обязательно, без оверлея текста. */
export class HeuristicMediaPromptWriter implements MediaPromptWriter {
  draftPrompt(
    cluster: MediaClusterInput,
    marketing: MediaMarketing,
    kind: MediaKind,
  ): string {
    const usp = marketing.usp[0] ?? cluster.name;
    const audience = marketing.target_audience[0]?.segment ?? "";
    const product = marketing.product_description?.trim() || cluster.name;
    const format =
      kind === "video"
        ? "5-second advertising video clip, no on-screen text, no watermark, no logos invented."
        : "Photorealistic advertising photo, no text overlay, no watermark, no logos invented. Square 1:1 composition for search ads.";
    return `${format} Product: ${product}. Offer: ${usp}. Audience: ${audience}. Subject: ${cluster.name}.`;
  }
}

export function mediaDimensions(kind: MediaKind): {
  width: number;
  height: number;
  duration_ms: number | null;
} {
  if (kind === "video") {
    return {
      width: VIDEO_SIZE.width,
      height: VIDEO_SIZE.height,
      duration_ms: VIDEO_DURATION_MS,
    };
  }
  return { width: IMAGE_SIZE.width, height: IMAGE_SIZE.height, duration_ms: null };
}

export function sanitizeMediaPrompt(
  prompt: string,
  marketing: MediaMarketing,
): string {
  const forbidden = marketing.forbidden_phrases ?? [];
  let result = sanitizeForbidden(prompt, forbidden);
  const usp = marketing.usp[0];
  if (usp && !normalizeHas(result, usp)) {
    result = `Offer: ${usp}. ${result}`;
  }
  result = sanitizeForbidden(result, forbidden);
  if (containsForbidden(result, forbidden)) {
    result = sanitizeForbidden(result, forbidden);
  }
  result = result.replace(/\s+/g, " ").trim();
  if (result.length > PROMPT_MAX) {
    result = result.slice(0, PROMPT_MAX).trim();
  }
  return result;
}

function normalizeHas(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
