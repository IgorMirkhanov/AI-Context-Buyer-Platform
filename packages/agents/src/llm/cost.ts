export function roundUsd(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

function ratesFor(model: string): { input: number; output: number } | null {
  const name = model.toLowerCase();
  if (name.includes("heuristic") || name === "mock") return null;
  if (name.includes("sonnet") || name.includes("claude")) {
    return { input: 3, output: 15 };
  }
  if (name.includes("gpt-4") || name.includes("gpt-4o")) {
    return { input: 2.5, output: 10 };
  }
  return { input: 0.25, output: 1.25 };
}

/** Оценка USD, если провайдер не вернул стоимость. Heuristic/mock = 0. */
export function estimateLlmCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const name = model.toLowerCase();
  if (name.includes("heuristic") || name === "mock") return 0;
  if (name.includes("dall-e") || name === "openai") return 0.04;
  const rates = ratesFor(model);
  if (!rates) return 0;
  return roundUsd(
    (Math.max(0, inputTokens) / 1_000_000) * rates.input +
      (Math.max(0, outputTokens) / 1_000_000) * rates.output,
  );
}

export function resolveLlmCostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}): number {
  if (typeof input.costUsd === "number" && input.costUsd > 0) {
    return roundUsd(input.costUsd);
  }
  return estimateLlmCostUsd(
    input.model,
    input.inputTokens,
    input.outputTokens,
  );
}

export type LlmUsageRow = {
  agentType: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type LlmUsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byAgent: Array<{
    agentType: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
};

export function summarizeLlmUsage(rows: LlmUsageRow[]): LlmUsageSummary {
  const byAgent = new Map<
    string,
    { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  >();
  for (const row of rows) {
    const current = byAgent.get(row.agentType) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.calls += 1;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    current.costUsd += Number(row.costUsd) || 0;
    byAgent.set(row.agentType, current);
  }
  const agents = [...byAgent.entries()]
    .map(([agentType, stats]) => ({
      agentType,
      calls: stats.calls,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      costUsd: roundUsd(stats.costUsd),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  return {
    calls: rows.length,
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    costUsd: roundUsd(rows.reduce((sum, row) => sum + (Number(row.costUsd) || 0), 0)),
    byAgent: agents,
  };
}

const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9]+|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|access_token\s*[:=]\s*\S+)/gi;

export function previewLlmText(text: string, max = 160): string {
  const redacted = (text || "").replace(SECRET_PATTERN, "[redacted]");
  const compact = redacted.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}
