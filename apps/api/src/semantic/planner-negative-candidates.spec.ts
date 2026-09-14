import {
  buildSuggestedNegativeWords,
  isCommercialKeyword,
  noncommercialPlannerNegativeCandidates,
  tokenize,
} from '@context-buyer/agents';
import type { KeywordIdea, SemanticKeyword } from '@context-buyer/agents';

const brief = {
  geo: ['RU-MOW'],
  usp: ['премиум ремонт квартир'],
  target_audience: [{ segment: 'владельцы квартир' }],
  global_negative_keywords: ['вакансия'],
  product_description: 'премиум ремонт под ключ',
  price_segment: 'premium',
};

describe('noncommercialPlannerNegativeCandidates', () => {
  it('extracts leftover tokens from non-commercial Planner phrases', () => {
    const ideas: KeywordIdea[] = [
      {
        phrase: 'купить ноутбук asus',
        frequency: 900,
        source: 'google_keyword_planner',
        competition: 'HIGH',
      },
      {
        phrase: 'ноутбук asus цена',
        frequency: 540,
        source: 'google_keyword_planner',
        competition: 'MEDIUM',
      },
      {
        phrase: 'ноутбук asus обзор',
        frequency: 280,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
      {
        phrase: 'ноутбук asus отзывы',
        frequency: 190,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
      {
        phrase: 'ноутбук asus бесплатно',
        frequency: 0,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
      {
        phrase: 'скачать драйвер asus',
        frequency: 120,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
    ];

    const result = noncommercialPlannerNegativeCandidates(ideas, {
      alreadyBlocked: ['вакансия'],
    });

    expect(result.every((item) => item.source === 'keyword_planner_noncommercial')).toBe(
      true,
    );
    const phrases = result.map((item) => item.phrase);
    expect(phrases).toEqual(
      expect.arrayContaining(['обзор', 'отзывы', 'скачать', 'драйвер']),
    );
    expect(phrases).not.toContain('ноутбук');
    expect(phrases).not.toContain('asus');
    expect(phrases).not.toContain('купить');
    expect(phrases).not.toContain('бесплатно');
  });

  it('works with mock_wordstat source used in GOOGLE_ADS_MOCK', () => {
    const ideas: KeywordIdea[] = [
      {
        phrase: 'купить установка брекетов',
        frequency: 900,
        source: 'mock_wordstat',
      },
      {
        phrase: 'установка брекетов обзор',
        frequency: 280,
        source: 'mock_wordstat',
      },
    ];
    const result = noncommercialPlannerNegativeCandidates(ideas);
    expect(result.map((item) => item.phrase)).toContain('обзор');
    expect(result.map((item) => item.phrase)).not.toContain('установка');
  });
});

describe('buildSuggestedNegativeWords integration', () => {
  it('merges planner + llm sources and does not intersect commercial core', () => {
    const plannerIdeas: KeywordIdea[] = [
      {
        phrase: 'заказать премиум ремонт',
        frequency: 800,
        source: 'google_keyword_planner',
        competition: 'HIGH',
      },
      {
        phrase: 'премиум ремонт цена',
        frequency: 500,
        source: 'google_keyword_planner',
        competition: 'MEDIUM',
      },
      {
        phrase: 'премиум ремонт обзор',
        frequency: 200,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
      {
        phrase: 'ремонт своими руками',
        frequency: 300,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
    ];
    const commercialKeywords: SemanticKeyword[] = [
      {
        phrase: 'заказать премиум ремонт',
        intent: 'hot',
        frequency: 800,
        source: 'google_keyword_planner',
      },
      {
        phrase: 'премиум ремонт цена',
        intent: 'hot',
        frequency: 500,
        source: 'google_keyword_planner',
      },
    ];

    const suggested = buildSuggestedNegativeWords({
      plannerIdeas,
      commercialKeywords,
      llmSuggestions: [
        {
          phrase: 'мастер класс',
          reason: 'обучение вместо услуги',
          source: 'llm_niche_antonym',
        },
        {
          phrase: 'премиум',
          reason: 'не должен попасть — это ядро',
          source: 'llm_negative_words',
        },
        {
          phrase: 'видео',
          reason: 'информационный интент',
          source: 'llm_negative_words',
        },
      ],
      brief,
    });

    const phrases = suggested.map((item) => item.phrase);
    expect(phrases).toEqual(
      expect.arrayContaining(['обзор', 'своими', 'руками', 'мастер класс', 'видео']),
    );
    expect(phrases).not.toContain('премиум');
    expect(phrases).not.toContain('ремонт');
    expect(phrases).not.toContain('заказать');
    expect(phrases).not.toContain('цена');

    const commercialCore = commercialKeywords
      .filter((item) => isCommercialKeyword(item.phrase, item.intent))
      .flatMap((item) => [item.phrase, ...tokenize(item.phrase)]);
    for (const phrase of phrases) {
      expect(commercialCore).not.toContain(phrase);
      const tokens = tokenize(phrase);
      if (tokens.length > 0) {
        expect(tokens.every((token) => commercialCore.includes(token))).toBe(
          false,
        );
      }
    }

    expect(
      suggested.some((item) => item.source === 'keyword_planner_noncommercial'),
    ).toBe(true);
    expect(suggested.some((item) => item.source === 'llm_niche_antonym')).toBe(
      true,
    );
    expect(suggested.some((item) => item.source === 'llm_negative_words')).toBe(
      true,
    );
  });

  it('protects USP tokens and drops model/SKU noise', () => {
    const plannerIdeas: KeywordIdea[] = [
      {
        phrase: 'купить кондиционер москва',
        frequency: 900,
        source: 'google_keyword_planner',
        competition: 'HIGH',
      },
      {
        phrase: 'кондиционер samsung ar09txhqasinua обзор',
        frequency: 40,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
      {
        phrase: 'продажа кондиционеров своими руками',
        frequency: 20,
        source: 'google_keyword_planner',
        competition: 'LOW',
      },
    ];
    const suggested = buildSuggestedNegativeWords({
      plannerIdeas,
      commercialKeywords: [
        {
          phrase: 'купить кондиционер москва',
          intent: 'hot',
          frequency: 900,
          source: 'google_keyword_planner',
        },
      ],
      llmSuggestions: [
        {
          phrase: 'продажа',
          reason: 'не должно пройти — УТП',
          source: 'llm_negative_words',
        },
        {
          phrase: 'монтаж',
          reason: 'не должно пройти — УТП',
          source: 'llm_niche_antonym',
        },
        {
          phrase: 'вакансия',
          reason: 'карьера',
          source: 'llm_niche_antonym',
        },
      ],
      brief: {
        geo: ['RU-MOW'],
        usp: ['продажа и монтаж кондиционеров', 'быстрая доставка по москве'],
        target_audience: [{ segment: 'владельцы квартир' }],
        global_negative_keywords: [],
      },
    });
    const phrases = suggested.map((item) => item.phrase);
    expect(phrases).toContain('вакансия');
    expect(phrases).toContain('обзор');
    expect(phrases).not.toContain('продажа');
    expect(phrases).not.toContain('монтаж');
    expect(phrases).not.toContain('кондиционеров');
    expect(phrases).not.toContain('ar09txhqasinua');
    expect(phrases).toEqual(expect.arrayContaining(['обзор', 'своими', 'руками']));
  });
});
