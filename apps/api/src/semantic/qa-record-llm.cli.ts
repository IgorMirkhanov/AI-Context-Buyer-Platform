/**
 * One-off recorder: live suggestNearIntentPhrases → qa/semantic/llm-replay/.
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run qa:semantic:record-llm
 *   GROQ_API_KEY=gsk_... npm run qa:semantic:record-llm -- --provider groq
 *   GEMINI_API_KEY=... npm run qa:semantic:record-llm -- --provider gemini
 * Optional: QA_RECORD_MODEL=claude-3-5-haiku-20241022 | llama-3.1-8b-instant | gemini-3.6-flash
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { MockKeywordIdeasProvider } from "@context-buyer/connectors";
import {
  AnthropicSemanticLlm,
  GeminiSemanticLlm,
  GroqSemanticLlm,
  HeuristicSemanticLlm,
  GROQ_DEFAULT_MODEL,
  GEMINI_DEFAULT_MODEL,
  readEnvAiKey,
  extractMasksStep,
  expandKeywordsStep,
  filterKeywordsStep,
  type SemanticBriefInput,
  type SemanticLlm,
  type SemanticQaFixture,
} from "@context-buyer/agents";
import type { SemanticLlmReplayFixture } from "./qa-llm-replay";

const CONTROL_FIXTURES = ["orthodontics-clinic", "accounting-b2b"] as const;
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";

type RecordProvider = "anthropic" | "groq" | "gemini";

function repoRoot(): string {
  return path.resolve(__dirname, "../../../..");
}

function parseArgs(argv: string[]): {
  provider: RecordProvider;
  fixtureIds: string[];
} {
  let provider: RecordProvider = "anthropic";
  const fixtureIds: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider" && argv[i + 1]) {
      const value = argv[i + 1];
      if (value !== "anthropic" && value !== "groq" && value !== "gemini") {
        throw new Error(
          `Unknown --provider ${value} (use anthropic, groq, or gemini)`,
        );
      }
      provider = value;
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      fixtureIds.push(arg);
    }
  }
  return { provider, fixtureIds };
}

async function wordstatPhrasesForBrief(
  brief: SemanticBriefInput,
): Promise<string[]> {
  const llm = new HeuristicSemanticLlm();
  const ideas = new MockKeywordIdeasProvider();
  const masks = await extractMasksStep(brief, llm, "");
  const expanded = await expandKeywordsStep(masks, brief.geo, (seeds, geo) =>
    ideas.getKeywordIdeas(seeds, geo),
  );
  const filtered = filterKeywordsStep(expanded, brief);
  return filtered.map((item) => item.phrase);
}

function createLlm(
  provider: RecordProvider,
  apiKey: string,
  model: string,
): SemanticLlm {
  if (provider === "groq") {
    return new GroqSemanticLlm({ apiKey, model });
  }
  if (provider === "gemini") {
    return new GeminiSemanticLlm({ apiKey, model });
  }
  return new AnthropicSemanticLlm({ apiKey, model });
}

function sourceForProvider(provider: RecordProvider): SemanticLlmReplayFixture["source"] {
  if (provider === "groq") return "groq_live";
  if (provider === "gemini") return "gemini_live";
  return "claude_live";
}

function defaultModelForProvider(provider: RecordProvider): string {
  if (provider === "groq") return GROQ_DEFAULT_MODEL;
  if (provider === "gemini") return GEMINI_DEFAULT_MODEL;
  return DEFAULT_ANTHROPIC_MODEL;
}

function envKeyForProvider(provider: RecordProvider): string {
  if (provider === "groq") return "GROQ_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  return "ANTHROPIC_API_KEY";
}

async function recordFixture(
  fixture: SemanticQaFixture,
  llm: SemanticLlm,
  provider: RecordProvider,
  outDir: string,
): Promise<SemanticLlmReplayFixture> {
  const wordstatPhrases = await wordstatPhrasesForBrief(fixture.brief);
  const { phrases, usage } = await llm.suggestNearIntentPhrases(
    fixture.brief,
    wordstatPhrases,
  );
  const recorded: SemanticLlmReplayFixture = {
    fixtureId: fixture.id,
    source: sourceForProvider(provider),
    model: usage.model,
    recordedAt: new Date().toISOString(),
    extract_masks: [],
    near_intent_phrases: phrases,
    rawResponse: usage.response,
    wordstatPhraseCount: wordstatPhrases.length,
  };
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${fixture.id}.json`);
  writeFileSync(outPath, `${JSON.stringify(recorded, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`  near-intent phrases (${phrases.length}):`);
  for (const phrase of phrases) {
    console.log(`    • ${phrase}`);
  }
  return recorded;
}

async function main() {
  const { provider, fixtureIds } = parseArgs(process.argv.slice(2));
  const apiKey = readEnvAiKey(provider);
  if (!apiKey || apiKey.startsWith("e2e-")) {
    const envName = envKeyForProvider(provider);
    console.error(
      `Set ${envName} to a real key (not e2e placeholder). Example:\n` +
        `  $env:${envName}='...'; npm run qa:semantic:record-llm -- --provider ${provider}`,
    );
    process.exitCode = 1;
    return;
  }
  const model =
    process.env.QA_RECORD_MODEL?.trim() || defaultModelForProvider(provider);
  const llm = createLlm(provider, apiKey, model);
  const fixturesDir = path.join(repoRoot(), "qa/semantic/fixtures");
  const outDir = path.join(repoRoot(), "qa/semantic/llm-replay");
  const ids = fixtureIds.length > 0 ? fixtureIds : [...CONTROL_FIXTURES];

  console.log(
    `Recording suggestNearIntentPhrases with provider=${provider} model=${model}`,
  );
  for (const id of ids) {
    const raw = readFileSync(path.join(fixturesDir, `${id}.json`), "utf8");
    const fixture = JSON.parse(raw) as SemanticQaFixture;
    await recordFixture(fixture, llm, provider, outDir);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
