import {
  clusterByCosine,
  EmbeddingsClient,
  HashNgramEmbeddings,
  InMemoryVectorIndex,
  VectorIndex,
} from "./embeddings";
import {
  extraNegativesFromBrief,
  filterKeywordIdeas,
  intentFromHeuristics,
  phraseClusteringCore,
  tokenize,
} from "./heuristics";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";
import {
  KeywordIdea,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
  SemanticCluster,
  SemanticCore,
  SemanticKeyword,
  SemanticPipelineResult,
  SuggestedNegativeWord,
} from "./types";
import { validateSemanticCore } from "./validate";
import { normalizePhrase } from "./qa-compare";
import { mergeSeedMasks } from "../analysis/pipeline";

export type KeywordIdeasFn = (
  seeds: string[],
  geo: string[],
) => Promise<KeywordIdea[]>;

export type SemanticPipelineDeps = {
  llm?: SemanticLlm;
  embeddings?: EmbeddingsClient;
  vectorIndex?: VectorIndex;
  getKeywordIdeas: KeywordIdeasFn;
  landingText?: string;
  extraSeeds?: string[];
  onLlmCall?: (usage: LlmUsage) => Promise<void> | void;
  /** Resolved org key (DB, else env). Heuristic path ignores it. */
  apiKey?: string | null;
};

export async function extractMasksStep(
  brief: SemanticBriefInput,
  llm: SemanticLlm,
  landingText: string,
): Promise<string[]> {
  const { masks, usage } = await llm.extractMasks(brief, landingText);
  await Promise.resolve();
  return masks.filter((mask) => mask.trim().length >= 3).slice(0, 30);
}

export async function expandKeywordsStep(
  masks: string[],
  geo: string[],
  getKeywordIdeas: KeywordIdeasFn,
): Promise<KeywordIdea[]> {
  if (masks.length === 0) {
    return [];
  }
  return getKeywordIdeas(masks, geo);
}

export function filterKeywordsStep(
  ideas: KeywordIdea[],
  brief: SemanticBriefInput,
): KeywordIdea[] {
  const negatives = generateNegativesStep(brief);
  return filterKeywordIdeas(ideas, negatives);
}

/** LLM-расширение по ручным seed-словам; heuristic-путь возвращает пустой список. */
export async function suggestFromSeedWordsStep(
  ideas: KeywordIdea[],
  brief: SemanticBriefInput,
  seedWords: string[],
  llm: SemanticLlm,
): Promise<KeywordIdea[]> {
  if (seedWords.length === 0) {
    return ideas;
  }
  const existingPhrases = ideas.map((item) => item.phrase);
  const { phrases } = await llm.suggestFromSeedWords(
    brief,
    seedWords,
    existingPhrases,
  );
  if (phrases.length === 0) {
    return ideas;
  }
  const seen = new Set(existingPhrases.map(normalizePhrase));
  const extras: KeywordIdea[] = [];
  for (const phrase of phrases) {
    const normalized = normalizePhrase(phrase);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    extras.push({
      phrase: normalized,
      frequency: 1,
      source: "llm_seed_expand",
    });
  }
  return [...ideas, ...extras];
}

/** LLM-подсказки near-intent поверх Wordstat; heuristic-путь возвращает пустой список. */
export async function suggestNearIntentStep(
  ideas: KeywordIdea[],
  brief: SemanticBriefInput,
  llm: SemanticLlm,
): Promise<KeywordIdea[]> {
  const wordstatPhrases = ideas.map((item) => item.phrase);
  const { phrases } = await llm.suggestNearIntentPhrases(brief, wordstatPhrases);
  if (phrases.length === 0) {
    return ideas;
  }
  const seen = new Set(wordstatPhrases.map(normalizePhrase));
  const extras: KeywordIdea[] = [];
  for (const phrase of phrases) {
    const normalized = normalizePhrase(phrase);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    extras.push({
      phrase: normalized,
      frequency: 1,
      source: "llm_near_intent",
    });
  }
  return [...ideas, ...extras];
}

/** Подсказки минус-слов по собранной семантике; heuristic без ключа — пустой список. */
export async function suggestNegativeWordsStep(
  brief: SemanticBriefInput,
  keywords: SemanticKeyword[],
  llm: SemanticLlm,
): Promise<SuggestedNegativeWord[]> {
  if (keywords.length === 0) {
    return [];
  }
  const collectedKeywords = keywords.map((item) => item.phrase);
  const { negatives } = await llm.suggestNegativeWords(
    brief,
    collectedKeywords,
  );
  if (negatives.length === 0) {
    return [];
  }
  const blocked = new Set(
    generateNegativesStep(brief).map((item) => normalizePhrase(item)),
  );
  const seen = new Set<string>();
  const result: SuggestedNegativeWord[] = [];
  for (const item of negatives) {
    const phrase = normalizePhrase(item.phrase);
    if (!phrase || phrase.length < 2 || blocked.has(phrase) || seen.has(phrase)) {
      continue;
    }
    seen.add(phrase);
    result.push({
      phrase,
      reason: item.reason.trim() || "нецелевой интент в собранной семантике",
    });
  }
  return result.slice(0, 15);
}

export async function labelIntentStep(
  ideas: KeywordIdea[],
  llm: SemanticLlm,
): Promise<SemanticKeyword[]> {
  const unlabeled: string[] = [];
  const labeled: SemanticKeyword[] = ideas.map((idea) => {
    const heuristic = intentFromHeuristics(idea.phrase);
    if (!heuristic) {
      unlabeled.push(idea.phrase);
    }
    return {
      phrase: idea.phrase,
      intent: heuristic ?? "warm",
      frequency: idea.frequency,
      source: idea.source,
    };
  });

  if (unlabeled.length === 0) {
    return labeled;
  }

  const { intents } = await llm.classifyIntents(unlabeled);
  const map = new Map(unlabeled.map((phrase, i) => [phrase, intents[i]]));
  return labeled.map((item) => ({
    ...item,
    intent: (intentFromHeuristics(item.phrase) ??
      map.get(item.phrase) ??
      item.intent) as KeywordIntent,
  }));
}

export function generateNegativesStep(brief: SemanticBriefInput): string[] {
  const fromBrief = brief.global_negative_keywords.map((item) =>
    item.toLowerCase(),
  );
  return Array.from(
    new Set([...fromBrief, ...extraNegativesFromBrief(brief)]),
  );
}

export async function clusterStep(
  keywords: SemanticKeyword[],
  embeddings: EmbeddingsClient,
  llm: SemanticLlm,
  vectorIndex: VectorIndex,
): Promise<SemanticCluster[]> {
  if (keywords.length === 0) {
    return [];
  }
  const phrases = keywords.map((item) => item.phrase);
  const clusteringTexts = phrases.map(phraseClusteringCore);
  const vectors = await embeddings.embed(clusteringTexts);
  phrases.forEach((phrase, i) => vectorIndex.upsert(phrase, vectors[i]));

  const groups = clusterByCosine(phrases, vectors);
  const byPhrase = new Map(keywords.map((item) => [item.phrase, item]));
  const clusters: SemanticCluster[] = [];

  for (const group of groups) {
    const { name, category } = await llm.nameCluster(group);
    clusters.push({
      cluster_name: name,
      category,
      keywords: group
        .map((phrase) => byPhrase.get(phrase))
        .filter((item): item is SemanticKeyword => Boolean(item)),
      negative_keywords: [],
    });
  }
  return clusters;
}

export function finalizeStep(
  clusters: SemanticCluster[],
  globalNegatives: string[],
): SemanticCore {
  const cleaned = clusters
    .map((cluster) => ({
      ...cluster,
      keywords: cluster.keywords.filter((item) => item.frequency > 0),
    }))
    .filter((cluster) => cluster.keywords.length > 0);

  const withCross = cleaned.map((cluster, index) => {
    const others = cleaned
      .filter((_, i) => i !== index)
      .flatMap((item) => item.keywords.map((kw) => kw.phrase));
    const distinctive = others.filter((phrase) => {
      const tokens = new Set(tokenize(phrase));
      return cluster.keywords.some((kw) =>
        tokenize(kw.phrase).some((token) => tokens.has(token)),
      );
    });
    return {
      ...cluster,
      negative_keywords: Array.from(
        new Set([...cluster.negative_keywords, ...distinctive]),
      ).slice(0, 40),
    };
  });

  return {
    clusters: withCross,
    global_negatives: globalNegatives,
  };
}

export async function runSemanticPipeline(
  brief: SemanticBriefInput,
  deps: SemanticPipelineDeps,
): Promise<SemanticPipelineResult> {
  const llm = deps.llm ?? new HeuristicSemanticLlm();
  const embeddings = deps.embeddings ?? new HashNgramEmbeddings();
  const vectorIndex = deps.vectorIndex ?? new InMemoryVectorIndex();
  const landingText = deps.landingText ?? "";

  const originalExtract = llm.extractMasks.bind(llm);
  const originalClassify = llm.classifyIntents.bind(llm);
  const originalName = llm.nameCluster.bind(llm);
  const originalNearIntent = llm.suggestNearIntentPhrases.bind(llm);
  const originalSeedExpand = llm.suggestFromSeedWords.bind(llm);
  const originalNegativeWords = llm.suggestNegativeWords.bind(llm);
  const wrapped: SemanticLlm = {
    extractMasks: async (b, t) => {
      const result = await originalExtract(b, t);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
    classifyIntents: async (phrases) => {
      const result = await originalClassify(phrases);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
    nameCluster: async (phrases) => {
      const result = await originalName(phrases);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
    suggestNearIntentPhrases: async (b, phrases) => {
      const result = await originalNearIntent(b, phrases);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
    suggestFromSeedWords: async (b, seeds, existing) => {
      const result = await originalSeedExpand(b, seeds, existing);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
    suggestNegativeWords: async (b, collected) => {
      const result = await originalNegativeWords(b, collected);
      await deps.onLlmCall?.(result.usage);
      return result;
    },
  };

  const extraSeeds = deps.extraSeeds ?? [];
  const masks = mergeSeedMasks(
    await extractMasksStep(brief, wrapped, landingText),
    extraSeeds,
  );
  const ideas = await expandKeywordsStep(
    masks,
    brief.geo,
    deps.getKeywordIdeas,
  );
  const withSeedExpand = await suggestFromSeedWordsStep(
    ideas,
    brief,
    extraSeeds,
    wrapped,
  );
  const filtered = filterKeywordsStep(withSeedExpand, brief);
  const withNearIntent = await suggestNearIntentStep(filtered, brief, wrapped);
  const relabeled = filterKeywordsStep(withNearIntent, brief);
  const labeled = await labelIntentStep(relabeled, wrapped);
  const globalNegatives = generateNegativesStep(brief);
  const clusters = await clusterStep(
    labeled,
    embeddings,
    wrapped,
    vectorIndex,
  );
  const core = finalizeStep(clusters, globalNegatives);
  validateSemanticCore(core);
  const suggested_negative_words = await suggestNegativeWordsStep(
    brief,
    labeled,
    wrapped,
  );
  return { core, suggested_negative_words };
}
