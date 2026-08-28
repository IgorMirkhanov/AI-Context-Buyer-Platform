import { MockKeywordIdeasProvider } from '@context-buyer/connectors';
import {
  clusterByCosine,
  expandKeywordsStep,
  extractMasksStep,
  finalizeStep,
  generateNegativesStep,
  HashNgramEmbeddings,
  HeuristicSemanticLlm,
  intentFromHeuristics,
  labelIntentStep,
  runSemanticPipeline,
  SemanticBriefInput,
  SemanticCoreValidationError,
  validateSemanticCore,
} from '@context-buyer/agents';

const brief: SemanticBriefInput = {
  website_url: 'https://asus-gaming.example',
  geo: ['RU-MOW'],
  usp: ['игровые ноутбуки asus', 'гарантия 3 года'],
  target_audience: [{ segment: 'геймеры 18-30' }],
  global_negative_keywords: ['бесплатно', 'скачать'],
  price_segment: 'premium',
};

describe('Semantic Agent pipeline steps', () => {
  const llm = new HeuristicSemanticLlm();
  const ideas = new MockKeywordIdeasProvider();

  it('extracts masks from the brief', async () => {
    const masks = await extractMasksStep(brief, llm, '');
    expect(masks.length).toBeGreaterThan(0);
    expect(masks.some((mask) => mask.includes('asus'))).toBe(true);
  });

  it('expands masks through getKeywordIdeas mock', async () => {
    const ideasList = await expandKeywordsStep(
      ['игровой ноутбук asus'],
      ['RU-MOW'],
      (seeds, geo) => ideas.getKeywordIdeas(seeds, geo),
    );
    expect(ideasList.some((item) => item.phrase.includes('купить'))).toBe(true);
    expect(ideasList.some((item) => item.frequency === 0)).toBe(true);
  });

  it('labels intent with hot heuristics', async () => {
    const labeled = await labelIntentStep(
      [
        { phrase: 'купить ноутбук asus', frequency: 100, source: 'mock' },
        { phrase: 'ноутбук asus обзор', frequency: 50, source: 'mock' },
      ],
      llm,
    );
    expect(intentFromHeuristics('купить ноутбук asus')).toBe('hot');
    expect(labeled.find((item) => item.phrase.includes('купить'))?.intent).toBe(
      'hot',
    );
    expect(labeled.find((item) => item.phrase.includes('обзор'))?.intent).toBe(
      'warm',
    );
  });

  it('builds global negatives from the brief', () => {
    const negatives = generateNegativesStep(brief);
    expect(negatives).toEqual(
      expect.arrayContaining(['бесплатно', 'скачать', 'дешевый']),
    );
  });

  it('clusters by embedding cosine, not by one LLM call', async () => {
    const embeddings = new HashNgramEmbeddings();
    const phrases = [
      'купить ноутбук asus',
      'ноутбук asus цена',
      'ремонт холодильника',
      'купить холодильник',
    ];
    const vectors = await embeddings.embed(phrases);
    const groups = clusterByCosine(phrases, vectors, 0.55);
    expect(groups.length).toBeGreaterThan(1);
  });

  it('drops zero frequency and cross-minuses clusters', () => {
    const core = finalizeStep(
      [
        {
          cluster_name: 'Asus',
          category: 'brand',
          keywords: [
            { phrase: 'купить asus', intent: 'hot', frequency: 100 },
            { phrase: 'asus бесплатно', intent: 'warm', frequency: 0 },
          ],
          negative_keywords: [],
        },
        {
          cluster_name: 'HP',
          category: 'brand',
          keywords: [{ phrase: 'купить hp', intent: 'hot', frequency: 80 }],
          negative_keywords: [],
        },
      ],
      ['скачать'],
    );
    expect(core.clusters[0].keywords.every((item) => item.frequency > 0)).toBe(
      true,
    );
    expect(core.clusters[0].negative_keywords.length).toBeGreaterThan(0);
    expect(core.global_negatives).toContain('скачать');
  });

  it('rejects an invalid semantic_core schema', () => {
    expect(() =>
      validateSemanticCore({ clusters: [], global_negatives: [] }),
    ).toThrow(SemanticCoreValidationError);
  });

  it('runs the full pipeline from brief to semantic_core', async () => {
    const logs: string[] = [];
    const core = await runSemanticPipeline(brief, {
      getKeywordIdeas: (seeds, geo) => ideas.getKeywordIdeas(seeds, geo),
      onLlmCall: (usage) => {
        logs.push(usage.step);
      },
    });
    expect(core.clusters.length).toBeGreaterThan(0);
    expect(core.clusters[0].keywords.length).toBeGreaterThan(0);
    expect(core.global_negatives).toEqual(
      expect.arrayContaining(['бесплатно']),
    );
    expect(logs.length).toBeGreaterThan(0);
    expect(() => validateSemanticCore(core)).not.toThrow();
  });
});
