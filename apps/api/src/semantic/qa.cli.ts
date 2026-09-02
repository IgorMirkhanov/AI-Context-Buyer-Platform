import { readdirSync, readFileSync } from "fs";
import path from "path";
import { MockKeywordIdeasProvider } from "@context-buyer/connectors";
import {
  AnthropicSemanticLlm,
  compareSemanticQa,
  compareCommercialGoldRecall,
  cosine,
  HashNgramEmbeddings,
  runSemanticPipeline,
  scoreClusterSeparation,
  type SemanticQaFixture,
} from "@context-buyer/agents";
import {
  createSemanticQaReplayFetch,
  loadSemanticLlmReplay,
} from "./qa-llm-replay";

function repoRoot(): string {
  return path.resolve(__dirname, "../../../..");
}

function loadFixtures(dir: string): SemanticQaFixture[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const raw = readFileSync(path.join(dir, name), "utf8");
      return JSON.parse(raw) as SemanticQaFixture;
    });
}

function pct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(4);
}

function line(title: string) {
  return `\n${title}\n${"─".repeat(Math.min(title.length, 60))}`;
}

async function runFixture(
  fixture: SemanticQaFixture,
  options: { useLlm: boolean; replayDir: string },
) {
  const ideas = new MockKeywordIdeasProvider();
  const llm = options.useLlm
    ? new AnthropicSemanticLlm({
        apiKey: "qa-replay-key",
        fetchImpl: createSemanticQaReplayFetch(
          loadSemanticLlmReplay(options.replayDir, fixture.id),
        ),
      })
    : undefined;
  const { core } = await runSemanticPipeline(fixture.brief, {
    llm,
    getKeywordIdeas: (seeds, geo) => ideas.getKeywordIdeas(seeds, geo),
  });
  const phrases = core.clusters.flatMap((cluster) =>
    cluster.keywords.map((item) => item.phrase),
  );
  const coverage = compareSemanticQa(fixture, {
    phrases,
    clusters: core.clusters.map((cluster) => ({
      name: cluster.cluster_name,
      phrases: cluster.keywords.map((item) => item.phrase),
    })),
    global_negatives: core.global_negatives,
  });
  const commercial = compareCommercialGoldRecall(fixture, {
    phrases,
    clusters: core.clusters.map((cluster) => ({
      name: cluster.cluster_name,
      phrases: cluster.keywords.map((item) => item.phrase),
    })),
    global_negatives: core.global_negatives,
  });
  const embeddings = new HashNgramEmbeddings();
  const clusterPhrases = core.clusters.map((cluster) =>
    cluster.keywords.map((item) => item.phrase),
  );
  const unique = [...new Set(clusterPhrases.flat())];
  const vectors = await embeddings.embed(unique);
  const byPhrase = new Map(unique.map((phrase, i) => [phrase, vectors[i]]));
  const clustering = scoreClusterSeparation(clusterPhrases, (a, b) => {
    const va = byPhrase.get(a);
    const vb = byPhrase.get(b);
    if (!va || !vb) return 0;
    return cosine(va, vb);
  });
  return { core, coverage, commercial, clustering, phrases };
}

function printFixture(
  fixture: SemanticQaFixture,
  result: Awaited<ReturnType<typeof runFixture>>,
) {
  const { coverage, commercial, clustering, phrases, core } = result;
  const chunks: string[] = [];
  chunks.push(line(`${fixture.title}  [${fixture.id}]`));
  chunks.push(fixture.provenance);
  chunks.push(
    `Бриф: ${fixture.brief.website_url ?? "—"} · УТП: ${fixture.brief.usp.join("; ")}`,
  );
  chunks.push(
    `Эталон: ${coverage.goldCount} ключей · агент: ${coverage.agentCount} ключей в ${core.clusters.length} кластерах`,
  );
  chunks.push("");
  chunks.push(
    `Покрытие (recall):  ${coverage.found.length}/${coverage.goldCount} = ${pct(coverage.recall)}`,
  );
  chunks.push(
    `Коммерческий recall: ${commercial.commercialFound.length}/${commercial.commercialGoldCount} = ${pct(commercial.commercialRecall)}`,
  );
  chunks.push(
    "  доля эталонных ключей, которые агент реально выдал (после нормализации регистра/пробелов).",
  );
  if (coverage.missing.length > 0) {
    chunks.push("  Не найдены в выходе:");
    for (const item of coverage.missing) {
      chunks.push(`    • ${item.phrase}`);
      chunks.push(`      источник: ${item.source}`);
    }
  } else {
    chunks.push("  Все эталонные ключи найдены.");
  }
  chunks.push("");
  chunks.push(
    `Точность (precision):  ${pct(coverage.precision)}  (мусор ${coverage.junk.length}/${coverage.agentCount} = ${pct(coverage.junkRate)})`,
  );
  chunks.push(
    "  Штрафуют только фразы из разовой ручной разметки irrelevant. Неразмеченное «лишнее» ниже — на разбор, не в знаменатель ошибки.",
  );
  if (coverage.junk.length > 0) {
    chunks.push("  Размеченный мусор в выходе:");
    for (const item of coverage.junk) {
      chunks.push(`    • ${item.phrase}`);
      chunks.push(`      ${item.reason} (${item.source})`);
    }
  } else {
    chunks.push("  Размеченного мусора в выходе нет.");
  }
  if (coverage.unlabeledExtras.length > 0) {
    chunks.push(
      `  Вне эталона, ещё не размечены (${coverage.unlabeledExtras.length}) — добавьте в gold или irrelevant:`,
    );
    for (const phrase of coverage.unlabeledExtras.slice(0, 30)) {
      chunks.push(`    • ${phrase}`);
    }
    if (coverage.unlabeledExtras.length > 30) {
      chunks.push(`    … и ещё ${coverage.unlabeledExtras.length - 30}`);
    }
  }
  chunks.push("");
  chunks.push(
    `Кластеризация:  intra ${num(clustering.intraMean)} − inter ${num(clustering.interMean)} = ${num(clustering.clusterSeparation)}`,
  );
  chunks.push(
    "  среднее косинусное сходство (hash-n-gram эмбеддинги агента) внутри кластера минус между случайными парами разных кластеров. Выше — кучнее свои, дальше чужие.",
  );
  if (core.clusters.length > 0) {
    chunks.push("  Состав кластеров агента:");
    for (const cluster of core.clusters) {
      const names = cluster.keywords.map((item) => item.phrase).join(", ");
      chunks.push(
        `    • ${cluster.cluster_name} [${cluster.category}] (${cluster.keywords.length}): ${names}`,
      );
    }
  }
  chunks.push("");
  chunks.push(
    `Минус-слова: эталон ${fixture.gold.global_negatives.map((item) => item.phrase).join(", ") || "—"}`,
  );
  if (coverage.negativeMissing.length > 0) {
    chunks.push("  Нет у агента:");
    for (const item of coverage.negativeMissing) {
      chunks.push(`    • ${item.phrase}  (${item.source})`);
    }
  }
  if (coverage.negativeExtra.length > 0) {
    chunks.push(
      `  Дополнительно у агента: ${coverage.negativeExtra.join(", ")}`,
    );
  }
  chunks.push(
    `Ключи агента: ${phrases.join(" · ") || "—"}`,
  );
  console.log(chunks.join("\n"));
}

async function main() {
  const json = process.argv.includes("--json");
  const useLlmIdeal = process.argv.includes("--llm-ideal");
  const useLlm = process.argv.includes("--llm") || useLlmIdeal;
  const fixturesDir = path.join(repoRoot(), "qa/semantic/fixtures");
  const replayDir = path.join(
    repoRoot(),
    "qa/semantic",
    useLlmIdeal ? "llm-replay-ideal" : "llm-replay",
  );
  const llmMode = useLlmIdeal
    ? "pipeline_ideal_replay"
    : useLlm
      ? "claude_replay"
      : "heuristic";
  const fixtures = loadFixtures(fixturesDir);
  if (fixtures.length === 0) {
    console.error(`Нет фикстур в ${fixturesDir}`);
    process.exitCode = 1;
    return;
  }
  const rows = [];
  if (!json) {
    console.log("Semantic Agent — регрессионный QA (диагностика, не pass/fail)");
    if (useLlm) {
      console.log(
        useLlmIdeal
          ? "Режим: pipeline replay с идеальным near-intent (qa/semantic/llm-replay-ideal/*.json) — регрессия плёнки данных."
          : "Режим: recorded Claude near-intent (qa/semantic/llm-replay/*.json) + MockKeywordIdeasProvider.",
      );
    } else {
      console.log(
        "Режим: HeuristicSemanticLlm + MockKeywordIdeasProvider.",
      );
      console.log(
        "  --llm-ideal  pipeline recall при идеальном LLM-ответе",
      );
      console.log(
        "  --llm        recall с записанным ответом Claude (llm-replay/)",
      );
    }
  }
  for (const fixture of fixtures) {
    const result = await runFixture(fixture, { useLlm, replayDir });
    rows.push({
      id: fixture.id,
      title: fixture.title,
      mode: llmMode,
      recall: result.coverage.recall,
      commercialRecall: result.commercial.commercialRecall,
      commercialGoldCount: result.commercial.commercialGoldCount,
      precision: result.coverage.precision,
      junkRate: result.coverage.junkRate,
      clusterSeparation: result.clustering.clusterSeparation,
      intraMean: result.clustering.intraMean,
      interMean: result.clustering.interMean,
      goldCount: result.coverage.goldCount,
      agentCount: result.coverage.agentCount,
      missing: result.coverage.missing.map((item) => item.phrase),
      junk: result.coverage.junk.map((item) => item.phrase),
      unlabeledExtras: result.coverage.unlabeledExtras,
    });
    if (!json) printFixture(fixture, result);
  }
  if (json) {
    console.log(JSON.stringify({ fixtures: rows }, null, 2));
    return;
  }
  console.log(line("Сводка"));
  console.log(`mode: ${llmMode}`);
  console.log(
    "id                  recall   precision  разделение кластеров  эталон/агент",
  );
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(20)} ${pct(row.recall).padStart(7)}  ${pct(row.precision).padStart(9)}  ${num(row.clusterSeparation).padStart(10)}           ${row.goldCount}/${row.agentCount}`,
    );
  }
  console.log(
    "\nЭто не автотест с порогом. Сверьте цифры с docs/12_SEMANTIC_QA_BASELINE.md после смены промптов/эвристик.",
  );
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
