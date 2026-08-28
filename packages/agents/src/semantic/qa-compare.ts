export type PhraseSource = {
  phrase: string;
  source: string;
  intent?: "hot" | "warm" | "navigational";
  cluster_hint?: string;
};

export type IrrelevantRule = {
  /** Exact phrase or a token that must appear as a whole word. */
  phrase: string;
  match: "exact" | "token" | "contains";
  reason: string;
  source: string;
};

export type SemanticQaFixture = {
  id: string;
  title: string;
  provenance: string;
  brief: {
    website_url?: string;
    geo: string[];
    usp: string[];
    target_audience: Array<{ segment: string }>;
    global_negative_keywords: string[];
    product_description?: string;
    price_segment?: string;
    forbidden_phrases?: string[];
  };
  gold: {
    keywords: PhraseSource[];
    global_negatives: PhraseSource[];
  };
  irrelevant: IrrelevantRule[];
};

export type SemanticQaAgentOutput = {
  phrases: string[];
  clusters: Array<{ name: string; phrases: string[] }>;
  global_negatives: string[];
};

export type SemanticQaMetrics = {
  recall: number | null;
  precision: number | null;
  junkRate: number | null;
  clusterSeparation: number | null;
  intraMean: number | null;
  interMean: number | null;
  goldCount: number;
  agentCount: number;
  found: string[];
  missing: PhraseSource[];
  junk: Array<{ phrase: string; reason: string; source: string }>;
  unlabeledExtras: string[];
  negativeMissing: PhraseSource[];
  negativeExtra: string[];
};

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenizePhrase(phrase: string): string[] {
  return normalizePhrase(phrase)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function matchesIrrelevant(
  phrase: string,
  rules: IrrelevantRule[],
): IrrelevantRule | null {
  const normalized = normalizePhrase(phrase);
  const tokens = new Set(tokenizePhrase(normalized));
  for (const rule of rules) {
    const needle = normalizePhrase(rule.phrase);
    if (!needle) continue;
    if (rule.match === "exact" && normalized === needle) return rule;
    if (rule.match === "token" && tokens.has(needle)) return rule;
    if (rule.match === "contains" && normalized.includes(needle)) return rule;
  }
  return null;
}

export function compareSemanticQa(
  fixture: SemanticQaFixture,
  agent: SemanticQaAgentOutput,
): Omit<
  SemanticQaMetrics,
  "clusterSeparation" | "intraMean" | "interMean"
> {
  const goldMap = new Map(
    fixture.gold.keywords.map((item) => [normalizePhrase(item.phrase), item]),
  );
  const goldSet = new Set(goldMap.keys());
  const agentSet = new Set(agent.phrases.map(normalizePhrase));
  const found: string[] = [];
  const missing: PhraseSource[] = [];
  for (const item of fixture.gold.keywords) {
    const key = normalizePhrase(item.phrase);
    if (agentSet.has(key)) found.push(key);
    else missing.push(item);
  }
  const junk: Array<{ phrase: string; reason: string; source: string }> = [];
  const unlabeledExtras: string[] = [];
  for (const raw of agentSet) {
    if (goldSet.has(raw)) continue;
    const hit = matchesIrrelevant(raw, fixture.irrelevant);
    if (hit) {
      junk.push({ phrase: raw, reason: hit.reason, source: hit.source });
    } else {
      unlabeledExtras.push(raw);
    }
  }
  unlabeledExtras.sort();
  const agentCount = agentSet.size;
  const goldCount = goldSet.size;
  const recall = goldCount === 0 ? null : found.length / goldCount;
  const junkRate = agentCount === 0 ? null : junk.length / agentCount;
  const precision = junkRate == null ? null : 1 - junkRate;

  const goldNeg = new Map(
    fixture.gold.global_negatives.map((item) => [
      normalizePhrase(item.phrase),
      item,
    ]),
  );
  const agentNeg = new Set(agent.global_negatives.map(normalizePhrase));
  const negativeMissing: PhraseSource[] = [];
  for (const item of fixture.gold.global_negatives) {
    if (!agentNeg.has(normalizePhrase(item.phrase))) negativeMissing.push(item);
  }
  const negativeExtra = [...agentNeg].filter((item) => !goldNeg.has(item)).sort();

  return {
    recall,
    precision,
    junkRate,
    goldCount,
    agentCount,
    found,
    missing,
    junk,
    unlabeledExtras,
    negativeMissing,
    negativeExtra,
  };
}

export function pairMean(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, item) => sum + item, 0) / scores.length;
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleInterPairs(
  clusters: string[][],
  maxPairs: number,
  rng: () => number,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      for (const a of clusters[i]) {
        for (const b of clusters[j]) {
          pairs.push([a, b]);
        }
      }
    }
  }
  if (pairs.length <= maxPairs) return pairs;
  const picked: Array<[string, string]> = [];
  const used = new Set<number>();
  while (picked.length < maxPairs && used.size < pairs.length) {
    const index = Math.floor(rng() * pairs.length);
    if (used.has(index)) continue;
    used.add(index);
    picked.push(pairs[index]);
  }
  return picked;
}

export function intraPairs(clusters: string[][]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const group of clusters) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        pairs.push([group[i], group[j]]);
      }
    }
  }
  return pairs;
}

export function round4(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

export function scoreClusterSeparation(
  clusters: string[][],
  similarity: (a: string, b: string) => number,
  opts?: { maxInterPairs?: number; seed?: number },
): Pick<SemanticQaMetrics, "intraMean" | "interMean" | "clusterSeparation"> {
  const intra = intraPairs(clusters).map(([a, b]) => similarity(a, b));
  const inter = sampleInterPairs(
    clusters,
    opts?.maxInterPairs ?? 400,
    mulberry32(opts?.seed ?? 1),
  ).map(([a, b]) => similarity(a, b));
  const intraMean = round4(pairMean(intra));
  const interMean = round4(pairMean(inter));
  const clusterSeparation =
    intraMean == null || interMean == null
      ? null
      : round4(intraMean - interMean);
  return { intraMean, interMean, clusterSeparation };
}
