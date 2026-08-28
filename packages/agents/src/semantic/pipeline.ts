import {
  clusterByCosine,
  EmbeddingsClient,
  HashNgramEmbeddings,
  InMemoryVectorIndex,
  VectorIndex,
} from "./embeddings";
import { extraNegativesFromBrief, intentFromHeuristics, tokenize } from "./heuristics";
import { HeuristicSemanticLlm, SemanticLlm } from "./llm";
import {
  KeywordIdea,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
  SemanticCluster,
  SemanticCore,
  SemanticKeyword,
} from "./types";
import { validateSemanticCore } from "./validate";

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
  const vectors = await embeddings.embed(phrases);
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
): Promise<SemanticCore> {
  const llm = deps.llm ?? new HeuristicSemanticLlm();
  const embeddings = deps.embeddings ?? new HashNgramEmbeddings();
  const vectorIndex = deps.vectorIndex ?? new InMemoryVectorIndex();
  const landingText = deps.landingText ?? "";

  const originalExtract = llm.extractMasks.bind(llm);
  const originalClassify = llm.classifyIntents.bind(llm);
  const originalName = llm.nameCluster.bind(llm);
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
  };

  const masks = await extractMasksStep(brief, wrapped, landingText);
  const ideas = await expandKeywordsStep(
    masks,
    brief.geo,
    deps.getKeywordIdeas,
  );
  const labeled = await labelIntentStep(ideas, wrapped);
  const globalNegatives = generateNegativesStep(brief);
  const clusters = await clusterStep(
    labeled,
    embeddings,
    wrapped,
    vectorIndex,
  );
  const core = finalizeStep(clusters, globalNegatives);
  validateSemanticCore(core);
  return core;
}
