import { readFileSync, readdirSync } from "fs";
import path from "path";
import { intentFromHeuristics } from "@context-buyer/agents";

export type SemanticLlmReplayFixture = {
  fixtureId: string;
  near_intent_phrases: string[];
  extract_masks?: string[];
  /** ideal_gold = regression pipe test; *_live = recorded API response */
  source?: "ideal_gold" | "claude_live" | "groq_live" | "gemini_live";
  model?: string;
  recordedAt?: string;
  rawResponse?: string;
  wordstatPhraseCount?: number;
};

const STEP_MARKERS = {
  extract_masks: "Извлеки до 20",
  classify_intent: "Классифицируй intent",
  name_cluster: "Дай короткое имя кластера",
  suggest_near_intent: "По брифу и уже найденным ключам",
} as const;

function anthropicBody(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 120, output_tokens: 48 },
  };
}

function responseForStep(
  user: string,
  replay: SemanticLlmReplayFixture,
): string {
  if (user.includes(STEP_MARKERS.extract_masks)) {
    const masks = replay.extract_masks ?? [];
    return JSON.stringify({ masks });
  }
  if (user.includes(STEP_MARKERS.suggest_near_intent)) {
    return JSON.stringify({ phrases: replay.near_intent_phrases });
  }
  if (user.includes(STEP_MARKERS.classify_intent)) {
    const lines = user.split("\n").slice(1).filter((line) => line.trim());
    const intents = lines.map(
      (phrase) => intentFromHeuristics(phrase) ?? "warm",
    );
    return JSON.stringify({ intents });
  }
  if (user.includes(STEP_MARKERS.name_cluster)) {
    const phrases = user.split("\n").slice(1).filter((line) => line.trim());
    const name = phrases[0] ?? "Кластер";
    return JSON.stringify({ name, category: "generic" });
  }
  return JSON.stringify({});
}

export function loadSemanticLlmReplay(
  replayDir: string,
  fixtureId: string,
): SemanticLlmReplayFixture {
  const filePath = path.join(replayDir, `${fixtureId}.json`);
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw new Error(
      `Missing LLM replay for "${fixtureId}" at ${filePath}. ` +
        `Run: npm run qa:semantic:record-llm (control fixtures) or copy from llm-replay-ideal/.`,
    );
  }
  return JSON.parse(raw) as SemanticLlmReplayFixture;
}

export function listSemanticLlmReplayIds(replayDir: string): string[] {
  return readdirSync(replayDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

export function createSemanticQaReplayFetch(
  replay: SemanticLlmReplayFixture,
): typeof fetch {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ content?: string }>;
    };
    const user = body.messages?.[0]?.content ?? "";
    const text = responseForStep(user, replay);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(anthropicBody(text)),
    } as Response;
  };
}
