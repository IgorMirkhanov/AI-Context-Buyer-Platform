import { estimateLlmCostUsd } from "./cost";

export type OpenAICompatibleMessageResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type OpenAICompatibleClientOptions = {
  apiKey: string;
  baseUrl: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 8000;

export async function openaiCompatibleChat(
  options: OpenAICompatibleClientOptions & {
    system: string;
    user: string;
    maxTokens?: number;
  },
): Promise<OpenAICompatibleMessageResult> {
  const started = Date.now();
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const model = options.model ?? "gpt-4o-mini";
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 2048,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI-compatible API ${res.status}: ${raw.slice(0, 240)}`);
  }
  const body = JSON.parse(raw) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  const inputTokens =
    body.usage?.prompt_tokens ?? Math.ceil(options.user.length / 4);
  const outputTokens =
    body.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  const resolvedModel = body.model ?? model;
  return {
    text,
    model: resolvedModel,
    inputTokens,
    outputTokens,
    costUsd: estimateLlmCostUsd(resolvedModel, inputTokens, outputTokens),
    latencyMs: Date.now() - started,
  };
}
