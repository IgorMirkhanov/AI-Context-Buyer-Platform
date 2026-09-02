import { estimateLlmCostUsd } from "./cost";

export type AnthropicMessageResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type AnthropicClientOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Request timeout in ms (default 8000, same as AiProviderService ping). */
  timeoutMs?: number;
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TIMEOUT_MS = 8000;

export async function anthropicMessages(
  options: AnthropicClientOptions & {
    system: string;
    user: string;
    maxTokens?: number;
  },
): Promise<AnthropicMessageResult> {
  const started = Date.now();
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 2048,
      system: options.system,
      messages: [{ role: "user", content: options.user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${raw.slice(0, 240)}`);
  }
  const body = JSON.parse(raw) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text =
    body.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim() ?? "";
  const inputTokens = body.usage?.input_tokens ?? Math.ceil(options.user.length / 4);
  const outputTokens =
    body.usage?.output_tokens ?? Math.ceil(text.length / 4);
  return {
    text,
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateLlmCostUsd(model, inputTokens, outputTokens),
    latencyMs: Date.now() - started,
  };
}

export function parseJsonFromLlm<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(body) as T;
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    const aStart = body.indexOf("[");
    const aEnd = body.lastIndexOf("]");
    if (aStart >= 0 && aEnd > aStart) {
      try {
        return JSON.parse(body.slice(aStart, aEnd + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
