import {
  filterNegativesAgainstCommercialCore,
  nicheCoreTokens,
  sanitizeBriefNegatives,
} from '@context-buyer/agents';

describe('pet niche must not become brief negatives', () => {
  const brief = {
    usp: ['Зоомагазин', 'Корм для животных'],
    product_description: 'Зоомагазин Алматы: корм, зоотовары, доставка',
    forbidden_phrases: [] as string[],
  };

  it('nicheCoreTokens expands pet lexicon', () => {
    const tokens = nicheCoreTokens({
      geo: ['KZ-ALA'],
      usp: brief.usp,
      target_audience: [],
      global_negative_keywords: [],
      product_description: brief.product_description,
    });
    expect(tokens.has('корм')).toBe(true);
    expect(tokens.has('кошки')).toBe(true);
    expect(tokens.has('ветаптека')).toBe(true);
  });

  it('sanitizeBriefNegatives strips pet core terms', () => {
    const cleaned = sanitizeBriefNegatives(
      [
        'корм',
        'кошки',
        'собаки',
        'ветаптека',
        'грызунов',
        'влажный',
        'зоомагазины',
        'вакансия',
        'бесплатно',
        'xiaomi',
      ],
      brief,
    );
    expect(cleaned).not.toContain('корм');
    expect(cleaned).not.toContain('кошки');
    expect(cleaned).not.toContain('ветаптека');
    expect(cleaned).not.toContain('зоомагазины');
    expect(cleaned).toContain('вакансия');
    expect(cleaned).toContain('бесплатно');
    expect(cleaned).toContain('xiaomi');
  });

  it('filterNegativesAgainstCommercialCore drops pet stems', () => {
    const out = filterNegativesAgainstCommercialCore(
      [
        {
          phrase: 'зоомагазины',
          reason: 'test',
          source: 'llm_negative_words',
        },
        {
          phrase: 'вакансия зоомагазин',
          reason: 'test',
          source: 'llm_niche_antonym',
        },
        {
          phrase: 'бесплатно',
          reason: 'test',
          source: 'llm_niche_antonym',
        },
      ],
      [...brief.usp, brief.product_description, 'корм', 'зоомагазин'],
    );
    expect(out.map((i) => i.phrase)).not.toContain('зоомагазины');
    expect(out.map((i) => i.phrase)).toContain('бесплатно');
  });
});
