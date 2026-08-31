import {
  AdCreativesValidationError,
  Copywriter,
  CopyMarketing,
  PlatformLimit,
  runCopyAndValidate,
  runCopywriting,
  SemanticCluster,
  SemanticCore,
  validateAdCreatives,
  validateCreatives,
} from '@context-buyer/agents';

const YANDEX_LIMITS: PlatformLimit[] = [
  { elementType: 'headline1', maxLength: 56, maxCount: 1 },
  { elementType: 'headline2', maxLength: 30, maxCount: 1 },
  { elementType: 'description', maxLength: 81, maxCount: 1 },
  { elementType: 'sitelink', maxLength: 30, maxCount: 4 },
  { elementType: 'callout', maxLength: 25, maxCount: 8 },
];

const marketing: CopyMarketing = {
  usp: ['Гарантия 3 года', 'Бесплатная доставка по РФ'],
  target_audience: [{ segment: 'геймеры 18-30' }],
  forbidden_phrases: ['самый дешёвый', 'без предоплаты'],
  geo: ['RU-MOW'],
};

const cluster = (
  name: string,
  keywords: Array<{ phrase: string; frequency?: number }>,
  negatives: string[] = [],
): SemanticCluster => ({
  cluster_name: name,
  category: 'brand',
  keywords: keywords.map((item) => ({
    phrase: item.phrase,
    intent: 'hot',
    frequency: item.frequency ?? 100,
  })),
  negative_keywords: negatives,
});

const core: SemanticCore = {
  clusters: [
    cluster('Asus ROG', [{ phrase: 'купить asus rog' }], ['купить hp omen']),
    cluster('HP Omen', [{ phrase: 'купить hp omen' }], ['купить asus rog']),
  ],
  global_negatives: ['бесплатно'],
};

class LeakyLlmCopywriter implements Copywriter {
  writeCluster(item: SemanticCluster): ReturnType<Copywriter['writeCluster']> {
    return {
      cluster_name: item.cluster_name,
      ab_variants: 2,
      ads: [
        {
          ab_group: 'A',
          headline1: `Купить самый дешёвый ${item.cluster_name}`,
          headline2: 'Гарантия 3 года',
          description: 'Гарантия 3 года. Официальный магазин',
          sitelinks: ['Гарантия 3 года', 'без предоплаты'],
          callouts: ['Гарантия 3 года'],
        },
        {
          ab_group: 'B',
          headline1: `${item.cluster_name} без предоплаты`,
          headline2: 'Бесплатная доставка по РФ',
          description: 'Бесплатная доставка по РФ. Склад в Москве',
          sitelinks: ['Бесплатная доставка по РФ'],
          callouts: ['Бесплатная доставка по РФ'],
        },
      ],
    };
  }
}

describe('Copywriting Agent', () => {
  it('uses USP and strips forbidden_phrases from a leaky LLM mock', async () => {
    const creatives = await runCopywriting(
      core,
      marketing,
      YANDEX_LIMITS,
      new LeakyLlmCopywriter(),
    );
    const blob = JSON.stringify(creatives).toLowerCase();
    expect(blob).not.toContain('самый дешёвый');
    expect(blob).not.toContain('без предоплаты');
    expect(blob).toContain('гарантия 3 года');
    expect(creatives[0].ads.length).toBeGreaterThanOrEqual(2);
    expect(() => validateAdCreatives(creatives)).not.toThrow();
  });

  it('heuristic copywriter never emits brief forbidden_phrases', async () => {
    const withLeakInAudience: CopyMarketing = {
      ...marketing,
      target_audience: [{ segment: 'самый дешёвый сегмент' }],
    };
    const creatives = await runCopywriting(core, withLeakInAudience, YANDEX_LIMITS);
    const blob = JSON.stringify(creatives).toLowerCase();
    expect(blob).not.toContain('самый дешёвый');
    expect(blob).toContain('гарантия');
  });
});

describe('Validation Agent', () => {
  it('clips over-limit fields and marks auto_fixed', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'A'.repeat(80),
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Asus купить',
              headline2: 'Доставка',
              description: 'Гарантия 3 года. Склад',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'купить asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.creatives[0].ads[0].headline1.length).toBe(56);
    expect(
      result.issues.some(
        (item) => item.code === 'length_limit' && item.autoFixed,
      ),
    ).toBe(true);
  });

  it('truncates sitelinks over maxCount', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Asus',
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: ['1', '2', '3', '4', '5', '6'],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Asus купить',
              headline2: 'Доставка',
              description: 'Склад в Москве',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'купить asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.creatives[0].ads[0].sitelinks).toHaveLength(4);
    expect(result.issues.some((item) => item.code === 'count_limit')).toBe(
      true,
    );
  });

  it('flags forbidden_phrases as critical without auto-fix', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Самый дешёвый Asus',
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Asus купить',
              headline2: 'Доставка',
              description: 'Склад в Москве',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'купить asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    const hit = result.issues.find((item) => item.code === 'forbidden_phrase');
    expect(hit?.level).toBe('critical');
    expect(hit?.autoFixed).toBe(false);
  });

  it('flags unsubstantiated claims as warning', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Лучший ноутбук Asus',
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Asus купить',
              headline2: 'Доставка',
              description: 'Склад в Москве',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'купить asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.issues.some((item) => item.code === 'risky_claim')).toBe(
      true,
    );
  });

  it('detects duplicate ads', () => {
    const ad = {
      headline1: 'Asus ROG',
      headline2: 'Гарантия 3 года',
      description: 'Одинаковый текст объявления',
      sitelinks: [] as string[],
      callouts: [] as string[],
    };
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            { ab_group: 'A', ...ad },
            { ab_group: 'B', ...ad },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'купить asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.issues.some((item) => item.code === 'duplicate_ad')).toBe(
      true,
    );
  });

  it('detects duplicate keywords across clusters', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'A',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Кластер A',
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Кластер A купить',
              headline2: 'Доставка',
              description: 'Склад',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [
          cluster('A', [{ phrase: 'купить asus' }]),
          cluster('B', [{ phrase: 'купить asus' }]),
        ],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(
      result.issues.some((item) => item.code === 'duplicate_keyword'),
    ).toBe(true);
  });

  it('detects missing cross-cluster negatives', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'A',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Кластер A',
              headline2: 'Гарантия 3 года',
              description: 'Гарантия 3 года',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Кластер A купить',
              headline2: 'Доставка',
              description: 'Склад',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [
          cluster('A', [{ phrase: 'купить asus' }], []),
          cluster('B', [{ phrase: 'купить hp' }], []),
        ],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.issues.some((item) => item.code === 'cross_minus_gap')).toBe(
      true,
    );
  });

  it('warns when CIS geo has no Cyrillic copy', () => {
    const result = validateCreatives(
      [
        {
          cluster_name: 'Asus',
          ab_variants: 2,
          ads: [
            {
              ab_group: 'A',
              headline1: 'Buy gaming laptop',
              headline2: 'Free shipping',
              description: 'Official store in EU',
              sitelinks: [],
              callouts: [],
            },
            {
              ab_group: 'B',
              headline1: 'Gaming notebook',
              headline2: 'Warranty',
              description: 'Warehouse now',
              sitelinks: [],
              callouts: [],
            },
          ],
        },
      ],
      {
        clusters: [cluster('Asus', [{ phrase: 'buy asus' }])],
        global_negatives: [],
      },
      marketing,
      YANDEX_LIMITS,
    );
    expect(result.issues.some((item) => item.code === 'geo_language')).toBe(
      true,
    );
  });
});

describe('Copywriting + Validation integration', () => {
  it('runs semantic_core → ad_creatives → validation issues', async () => {
    const result = await runCopyAndValidate(core, marketing, YANDEX_LIMITS);
    expect(result.creatives).toHaveLength(2);
    expect(result.creatives[0].ads.length).toBeGreaterThanOrEqual(2);
    const blob = JSON.stringify(result.creatives).toLowerCase();
    expect(blob).not.toContain('самый дешёвый');
    expect(blob).toContain('гарантия');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.some((item) => item.code === 'cross_minus_gap')).toBe(
      false,
    );
    expect(() => validateAdCreatives(result.creatives)).not.toThrow(
      AdCreativesValidationError,
    );
  });
});
