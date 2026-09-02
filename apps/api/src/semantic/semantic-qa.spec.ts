import {
  compareSemanticQa,
  compareCommercialGoldRecall,
  matchesIrrelevant,
  normalizePhrase,
  scoreClusterSeparation,
  type SemanticQaFixture,
} from '@context-buyer/agents';

const fixture: SemanticQaFixture = {
  id: 'toy',
  title: 'toy',
  provenance: 'unit',
  brief: {
    geo: ['RU-MOW'],
    usp: ['asus'],
    target_audience: [{ segment: 'геймеры' }],
    global_negative_keywords: ['бесплатно'],
  },
  gold: {
    keywords: [
      { phrase: 'купить asus', source: 'test' },
      { phrase: 'asus обзор', source: 'test' },
    ],
    global_negatives: [{ phrase: 'бесплатно', source: 'test' }],
  },
  irrelevant: [
    {
      phrase: 'ремонт',
      match: 'token',
      reason: 'сервис',
      source: 'test',
    },
    {
      phrase: 'геймеры',
      match: 'contains',
      reason: 'ца',
      source: 'test',
    },
  ],
};

describe('semantic QA comparison', () => {
  it('normalizes case and spaces before matching gold', () => {
    expect(normalizePhrase('  Купить   Asus ')).toBe('купить asus');
  });

  it('computes recall and treats only labeled junk as precision penalty', () => {
    const metrics = compareSemanticQa(fixture, {
      phrases: [
        'Купить Asus',
        'asus ремонт',
        'геймеры 18-30 цена',
        'гарантия 3 года',
      ],
      clusters: [],
      global_negatives: ['бесплатно', 'дешевый'],
    });
    expect(metrics.goldCount).toBe(2);
    expect(metrics.found).toEqual(['купить asus']);
    expect(metrics.missing.map((item) => item.phrase)).toEqual(['asus обзор']);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.junk.map((item) => item.phrase).sort()).toEqual([
      'asus ремонт',
      'геймеры 18-30 цена',
    ]);
    expect(metrics.unlabeledExtras).toEqual(['гарантия 3 года']);
    expect(metrics.junkRate).toBe(0.5);
    expect(metrics.precision).toBe(0.5);
    expect(metrics.negativeMissing).toEqual([]);
    expect(metrics.negativeExtra).toEqual(['дешевый']);
  });

  it('does not mark gold phrases as junk even if a rule would match', () => {
    const withGoldJunk = {
      ...fixture,
      gold: {
        ...fixture.gold,
        keywords: [{ phrase: 'asus ремонт', source: 'test' }],
      },
    };
    const metrics = compareSemanticQa(withGoldJunk, {
      phrases: ['asus ремонт'],
      clusters: [],
      global_negatives: [],
    });
    expect(metrics.junk).toEqual([]);
    expect(metrics.found).toEqual(['asus ремонт']);
  });

  it('matches hyphenated hosts with contains, not broken tokens', () => {
    expect(
      matchesIrrelevant('купить e2e-shop цена', [
        {
          phrase: 'e2e-shop',
          match: 'contains',
          reason: 'host',
          source: 'test',
        },
      ])?.phrase,
    ).toBe('e2e-shop');
    expect(
      matchesIrrelevant('купить ноутбук', [
        {
          phrase: 'e2e-shop',
          match: 'contains',
          reason: 'host',
          source: 'test',
        },
      ]),
    ).toBeNull();
  });

  it('scores cluster separation as intra minus inter cosine', () => {
    const sim: Record<string, number> = {
      'a|b': 0.9,
      'c|d': 0.8,
      'a|c': 0.1,
      'a|d': 0.2,
      'b|c': 0.1,
      'b|d': 0.2,
    };
    const similarity = (x: string, y: string) => {
      const key = [x, y].sort().join('|');
      return sim[key] ?? 0;
    };
    const scored = scoreClusterSeparation(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      similarity,
      { maxInterPairs: 100, seed: 1 },
    );
    expect(scored.intraMean).toBe(0.85);
    expect(scored.interMean).toBe(0.15);
    expect(scored.clusterSeparation).toBe(0.7);
  });

  it('returns null cluster scores when there are no pairs', () => {
    const scored = scoreClusterSeparation([['only']], () => 1);
    expect(scored.intraMean).toBeNull();
    expect(scored.interMean).toBeNull();
    expect(scored.clusterSeparation).toBeNull();
  });

  it('computes commercial gold recall separately from full recall', () => {
    const commercial = compareCommercialGoldRecall(fixture, {
      phrases: ['Купить Asus', 'asus ремонт'],
      clusters: [],
      global_negatives: [],
    });
    expect(commercial.commercialGoldCount).toBe(1);
    expect(commercial.commercialFound).toEqual(['купить asus']);
    expect(commercial.commercialRecall).toBe(1);
    expect(commercial.commercialMissing).toEqual([]);
  });

  it('does not count navigational or review gold as commercial', () => {
    const commercial = compareCommercialGoldRecall(fixture, {
      phrases: [],
      clusters: [],
      global_negatives: [],
    });
    expect(commercial.commercialGoldCount).toBe(1);
    expect(commercial.commercialMissing.map((item) => item.phrase)).toEqual([
      'купить asus',
    ]);
    expect(commercial.commercialRecall).toBe(0);
  });
});
