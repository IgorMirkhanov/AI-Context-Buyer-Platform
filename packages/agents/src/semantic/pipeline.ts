import {
  clusteringPartitionKey,
  dominantClusterPartition,
  expandThinPublishKeywords,
  extraNegativesFromBrief,
  filterKeywordIdeas,
  filterNegativesAgainstCommercialCore,
  intentFromHeuristics,
  isCommercialKeyword,
  isPhraseOnNiche,
  isPublishWorthyKeyword,
  isSensibleSearchKeyword,
  mergeSuggestedNegativeWords,
  nicheCoreTokens,
  noncommercialPlannerNegativeCandidates,
  normalizeNegativeSource,
  padKeywordIdeasWithCommercialVariants,
  phraseClusteringCore,
  productFamilyFromPhrase,
  sanitizeBriefNegatives,
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
import {
  clusterByCosine,
  EmbeddingsClient,
  HashNgramEmbeddings,
  InMemoryVectorIndex,
  VectorIndex,
} from "./embeddings";

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
  const ideas = await getKeywordIdeas(masks, geo);
  const cleaned = ideas.filter((idea) => isSensibleSearchKeyword(idea.phrase));
  // Live Keyword Planner is often thin for niche+city; pad lightly from
  // sensible seeds only — never flood with template spam.
  if (cleaned.length >= 12) {
    return cleaned;
  }
  return padKeywordIdeasWithCommercialVariants(cleaned, masks, 8);
}

export function filterKeywordsStep(
  ideas: KeywordIdea[],
  brief: SemanticBriefInput,
): KeywordIdea[] {
  const safeBrief: SemanticBriefInput = {
    ...brief,
    global_negative_keywords: sanitizeBriefNegatives(
      brief.global_negative_keywords,
      brief,
    ),
  };
  const negatives = generateNegativesStep(safeBrief);
  return filterKeywordIdeas(ideas, negatives)
    .filter((idea) => isPhraseOnNiche(idea.phrase, brief))
    .filter((idea) => {
      const intent = intentFromHeuristics(idea.phrase);
      return isCommercialKeyword(idea.phrase, intent ?? undefined);
    });
}

/** Оставляем только коммерческие фразы после разметки intent. */
export function filterCommercialKeywords(
  keywords: SemanticKeyword[],
): SemanticKeyword[] {
  return keywords.filter((item) =>
    isCommercialKeyword(item.phrase, item.intent),
  );
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
  // Keep Semantic Core dominated by real query volume; LLM fills gaps only.
  if (ideas.length >= 15) {
    return ideas;
  }
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
      source: normalizeNegativeSource(item.source),
    });
  }
  return result.slice(0, 15);
}

/**
 * Planner non-commercial tokens + LLM suggestions, без пересечения с коммерческим ядром.
 */
export function buildSuggestedNegativeWords(params: {
  plannerIdeas: KeywordIdea[];
  commercialKeywords: SemanticKeyword[];
  llmSuggestions: SuggestedNegativeWord[];
  brief: SemanticBriefInput;
}): SuggestedNegativeWord[] {
  const blocked = generateNegativesStep(params.brief);
  const commercialPhrases = params.commercialKeywords
    .filter((item) => isCommercialKeyword(item.phrase, item.intent))
    .map((item) => item.phrase);
  // USP / описание / все собранные фразы — коммерческое ядро (даже без «купить»).
  const protectedPhrases = [
    ...commercialPhrases,
    ...params.commercialKeywords.map((item) => item.phrase),
    ...params.brief.usp,
    params.brief.product_description ?? "",
    ...nicheCoreTokens(params.brief),
  ].filter(Boolean);
  const fromPlanner = noncommercialPlannerNegativeCandidates(
    params.plannerIdeas,
    { alreadyBlocked: blocked, brief: params.brief },
  );
  const fromLlm = params.llmSuggestions;
  const merged = mergeSuggestedNegativeWords(fromPlanner, fromLlm);
  return filterNegativesAgainstCommercialCore(merged, protectedPhrases).slice(
    0,
    40,
  );
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

  // Жёсткие перегородки: тип услуги × продуктовое семейство, затем cosine внутри.
  const partitions = new Map<string, SemanticKeyword[]>();
  for (const item of keywords) {
    const key = clusteringPartitionKey(item.phrase);
    const list = partitions.get(key) ?? [];
    list.push(item);
    partitions.set(key, list);
  }

  const clusters: SemanticCluster[] = [];
  for (const group of partitions.values()) {
    const phrases = group.map((item) => item.phrase);
    const clusteringTexts = phrases.map(phraseClusteringCore);
    const vectors = await embeddings.embed(clusteringTexts);
    phrases.forEach((phrase, i) => vectorIndex.upsert(phrase, vectors[i]));

    const cosineGroups =
      phrases.length === 1
        ? [phrases]
        : clusterByCosine(phrases, vectors);
    const byPhrase = new Map(group.map((item) => [item.phrase, item]));

    for (const cosineGroup of cosineGroups) {
      // Чистота семьи: выкидываем фразы, не совпавшие с доминирующим семейством группы.
      const { family } = dominantClusterPartition(cosineGroup);
      const pure = cosineGroup.filter(
        (phrase) =>
          family === "family:other" ||
          productFamilyFromPhrase(phrase) === family,
      );
      const members = (pure.length > 0 ? pure : cosineGroup)
        .map((phrase) => byPhrase.get(phrase))
        .filter((item): item is SemanticKeyword => Boolean(item));
      if (members.length === 0) continue;
      const { name, category } = await llm.nameCluster(
        members.map((item) => item.phrase),
      );
      clusters.push({
        cluster_name: name,
        category,
        keywords: members,
        negative_keywords: [],
      });
    }
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

  // Concurrent or heuristic naming can emit the same cluster_name twice;
  // merge before cross-minus so campaign plan validation stays 1:1.
  const mergedByName = new Map<string, (typeof cleaned)[number]>();
  for (const cluster of cleaned) {
    const key = cluster.cluster_name.trim().toLowerCase();
    const prev = mergedByName.get(key);
    if (!prev) {
      mergedByName.set(key, cluster);
      continue;
    }
    const phrases = new Set(prev.keywords.map((item) => item.phrase));
    mergedByName.set(key, {
      ...prev,
      keywords: [
        ...prev.keywords,
        ...cluster.keywords.filter((item) => !phrases.has(item.phrase)),
      ],
      negative_keywords: Array.from(
        new Set([...prev.negative_keywords, ...cluster.negative_keywords]),
      ),
    });
  }
  const unique = [...mergedByName.values()]
    .map((cluster) => {
      // Drop junk / competitor / non-sensible rows before padding.
      const quality = cluster.keywords.filter((item) =>
        isPublishWorthyKeyword(item.phrase, {
          frequency: item.frequency,
          source: item.source,
          intent: item.intent,
        }),
      );
      const kept =
        quality.length > 0
          ? quality
          : cluster.keywords.filter((item) =>
              isSensibleSearchKeyword(item.phrase),
            );
      return { ...cluster, keywords: kept };
    })
    .filter((cluster) => cluster.keywords.length > 0)
    // Prefer clusters with real Planner volume; keep a compact, reviewable set.
    .sort((a, b) => {
      const score = (c: typeof a) =>
        c.keywords.reduce((sum, kw) => sum + (kw.frequency ?? 0), 0);
      return score(b) - score(a);
    })
    .slice(0, 15)
    .map((cluster) => {
      // Hard-cap keywords inside each cluster for Plan UI / publish clarity.
      const rankedKw = [...cluster.keywords].sort(
        (a, b) => (b.frequency ?? 0) - (a.frequency ?? 0),
      );
      const capped = rankedKw.slice(0, 12);
      if (capped.length >= 3) {
        return { ...cluster, keywords: capped };
      }
      const expanded = expandThinPublishKeywords(
        capped.map((item) => item.phrase),
        2,
        5,
      );
      const existing = new Set(
        capped.map((item) => item.phrase.trim().toLowerCase()),
      );
      const intent = capped[0]?.intent ?? "hot";
      const added = expanded
        .filter((phrase) => !existing.has(phrase.trim().toLowerCase()))
        .filter((phrase) =>
          isPublishWorthyKeyword(phrase, {
            frequency: 1,
            source: "seed_expand_templates",
            intent,
          }),
        )
        .map((phrase) => ({
          phrase,
          intent,
          frequency: 1,
          source: "seed_expand_templates",
        }));
      return {
        ...cluster,
        keywords: [...capped, ...added].slice(0, 12),
      };
    });

  return {
    clusters: unique,
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
  const cleanedBrief: SemanticBriefInput = {
    ...brief,
    global_negative_keywords: sanitizeBriefNegatives(
      brief.global_negative_keywords,
      brief,
    ),
  };
  const masks = mergeSeedMasks(
    await extractMasksStep(cleanedBrief, wrapped, landingText),
    extraSeeds,
  );
  const ideas = await expandKeywordsStep(
    masks,
    cleanedBrief.geo,
    deps.getKeywordIdeas,
  );
  const withSeedExpand = await suggestFromSeedWordsStep(
    ideas,
    cleanedBrief,
    extraSeeds,
    wrapped,
  );
  const filtered = filterKeywordsStep(withSeedExpand, cleanedBrief);
  const withNearIntent = await suggestNearIntentStep(
    filtered,
    cleanedBrief,
    wrapped,
  );
  const relabeled = filterKeywordsStep(withNearIntent, cleanedBrief);
  const labeled = await labelIntentStep(relabeled, wrapped);
  const commercialKeywords = filterCommercialKeywords(labeled);
  const globalNegatives = generateNegativesStep(cleanedBrief);
  const clusters = await clusterStep(
    commercialKeywords,
    embeddings,
    wrapped,
    vectorIndex,
  );
  const core = finalizeStep(clusters, globalNegatives);
  if (core.clusters.length === 0) {
    throw new Error(
      "Семантика пустая: Keyword Planner не вернул фразы с частотностью и конкуренцией, " +
        "либо все отфильтрованы минус-словами брифа. " +
        "Сохраните бриф без минусов по ядру ниши (товар/услуга), обновите токен Google Ads " +
        "или временно поставьте GOOGLE_ADS_MOCK=1 для локальной проверки.",
    );
  }
  validateSemanticCore(core);
  const llmNegatives = await suggestNegativeWordsStep(
    cleanedBrief,
    commercialKeywords,
    wrapped,
  );
  const suggested_negative_words = buildSuggestedNegativeWords({
    plannerIdeas: ideas,
    commercialKeywords,
    llmSuggestions: llmNegatives,
    brief: cleanedBrief,
  });
  return {
    core,
    suggested_negative_words,
    sanitized_global_negatives: cleanedBrief.global_negative_keywords,
  };
}
