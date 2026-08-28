/**
 * Векторный индекс с косинусной близостью.
 * Реализация в памяти; контракт тот же, что у pgvector-адаптера (Этап 2+).
 */
export interface VectorIndex {
  upsert(id: string, vector: number[]): void;
  similar(vector: number[], limit: number): Array<{ id: string; score: number }>;
}

export class InMemoryVectorIndex implements VectorIndex {
  private readonly items = new Map<string, number[]>();

  upsert(id: string, vector: number[]): void {
    this.items.set(id, vector);
  }

  similar(vector: number[], limit: number): Array<{ id: string; score: number }> {
    const scored: Array<{ id: string; score: number }> = [];
    for (const [id, stored] of this.items) {
      scored.push({ id, score: cosine(vector, stored) });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

export interface EmbeddingsClient {
  embed(texts: string[]): Promise<number[][]>;
}

/** Детерминированные эмбеддинги по n-граммам — замена внешнего API в тестах и без ключа. */
export class HashNgramEmbeddings implements EmbeddingsClient {
  constructor(private readonly dimensions = 48) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const normalized = ` ${text.toLowerCase()} `;
    for (let i = 0; i < normalized.length - 2; i += 1) {
      const gram = normalized.slice(i, i + 3);
      const bucket = hash32(gram) % this.dimensions;
      vec[bucket] += 1;
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function clusterByCosine(
  ids: string[],
  vectors: number[][],
  threshold = 0.62,
): string[][] {
  const assigned = new Array<number>(ids.length).fill(-1);
  const centroids: number[][] = [];

  for (let i = 0; i < ids.length; i += 1) {
    let best = -1;
    let bestScore = -1;
    for (let c = 0; c < centroids.length; c += 1) {
      const score = cosine(vectors[i], centroids[c]);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best >= 0 && bestScore >= threshold) {
      assigned[i] = best;
      centroids[best] = average(centroids[best], vectors[i]);
    } else {
      assigned[i] = centroids.length;
      centroids.push(vectors[i].slice());
    }
  }

  const groups = new Map<number, string[]>();
  assigned.forEach((cluster, index) => {
    const list = groups.get(cluster) ?? [];
    list.push(ids[index]);
    groups.set(cluster, list);
  });
  return Array.from(groups.values());
}

function average(a: number[], b: number[]): number[] {
  return a.map((value, i) => (value + b[i]) / 2);
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
