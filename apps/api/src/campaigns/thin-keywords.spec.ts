import {
  expandThinPublishKeywords,
  isSensibleSearchKeyword,
  naturalCommercialVariants,
  phraseMatchesNegatives,
  sanitizeNegativesAgainstPositives,
  selectPublishWorthyKeywords,
} from '@context-buyer/agents';

describe('thin keyword + negative sanitization', () => {
  it('does not invent «купить магазин …»', () => {
    const variants = naturalCommercialVariants('магазин для животных алматы');
    expect(variants.some((v) => v.startsWith('купить магазин'))).toBe(false);
    expect(variants.some((v) => v.includes('недорого'))).toBe(true);
  });

  it('rejects SKU junk and competitor leaks', () => {
    expect(isSensibleSearchKeyword('креатив s8')).toBe(false);
    expect(isSensibleSearchKeyword('креатив 58')).toBe(false);
    expect(isSensibleSearchKeyword('skillbox продвижение в instagram')).toBe(
      false,
    );
    expect(isSensibleSearchKeyword('продвижение сайтов заказать')).toBe(true);
  });

  it('selectPublishWorthyKeywords prefers volume and drops templates', () => {
    const out = selectPublishWorthyKeywords(
      [
        {
          phrase: 'продвижение сайтов заказать',
          frequency: 120,
          source: 'google_keyword_planner',
          intent: 'hot',
        },
        {
          phrase: 'купить креатив s8',
          frequency: 1,
          source: 'seed_expand_templates',
          intent: 'hot',
        },
        {
          phrase: 'продвижение сайтов цена',
          frequency: 1,
          source: 'seed_expand_templates',
          intent: 'hot',
        },
      ],
      { maxCount: 12, minCount: 2 },
    );
    expect(out).toContain('продвижение сайтов заказать');
    expect(out.some((p) => p.includes('s8'))).toBe(false);
  });

  it('expandThinPublishKeywords keeps only sensible phrases', () => {
    const out = expandThinPublishKeywords(
      ['магазин для животных алматы', 'купить магазин для животных алматы'],
      2,
    );
    expect(out.every(isSensibleSearchKeyword)).toBe(true);
    expect(out.some((v) => v.startsWith('купить магазин'))).toBe(false);
  });

  it('rejects nonsense search keywords', () => {
    expect(isSensibleSearchKeyword('купить магазин для животных алматы')).toBe(
      false,
    );
    expect(isSensibleSearchKeyword('доставка корма алматы')).toBe(true);
  });

  it('drops negatives that block positives', () => {
    const cleaned = sanitizeNegativesAgainstPositives(
      ['магазин', 'almaty', 'xiaomi', 'ветеринарный'],
      ['магазин для животных алматы', 'доставка корма алматы'],
    );
    expect(cleaned).not.toContain('магазин');
    expect(cleaned).toContain('xiaomi');
    expect(cleaned).toContain('ветеринарный');
  });

  it('phraseMatchesNegatives detects token hits', () => {
    expect(
      phraseMatchesNegatives('магазин для животных алматы', ['магазин']),
    ).toBe(true);
  });
});
