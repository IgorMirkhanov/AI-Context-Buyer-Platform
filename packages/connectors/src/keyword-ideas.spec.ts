import {
  MockKeywordIdeasProvider,
  seedHasCommercialModifier,
} from './keyword-ideas';

describe('seedHasCommercialModifier', () => {
  it('detects pre-built commercial seeds', () => {
    expect(
      seedHasCommercialModifier('купить установка брекетов санкт-петербург'),
    ).toBe(true);
    expect(
      seedHasCommercialModifier('установка брекетов санкт-петербург цена'),
    ).toBe(true);
    expect(
      seedHasCommercialModifier('установка брекетов санкт-петербург стоимость'),
    ).toBe(true);
    expect(seedHasCommercialModifier('установка брекетов под ключ')).toBe(false);
  });

  it('treats any COMMERCIAL_TRIGGERS token as already commercial', () => {
    expect(
      seedHasCommercialModifier('заказать выезд мастера в день обращения'),
    ).toBe(true);
    expect(seedHasCommercialModifier('выезд мастера заказать')).toBe(true);
    expect(seedHasCommercialModifier('записаться на консультацию')).toBe(true);
    expect(seedHasCommercialModifier('выезд мастера в день обращения')).toBe(
      false,
    );
  });
});

describe('MockKeywordIdeasProvider', () => {
  const provider = new MockKeywordIdeasProvider();

  it('expands bare seeds with Wordstat templates', async () => {
    const ideas = await provider.getKeywordIdeas(['ноутбук asus'], ['RU-MOW']);
    expect(ideas.map((item) => item.phrase)).toEqual(
      expect.arrayContaining([
        'ноутбук asus',
        'купить ноутбук asus',
        'ноутбук asus цена',
      ]),
    );
    expect(ideas.length).toBeGreaterThan(3);
  });

  it('does not stack templates on geo+commercial masks', async () => {
    const ideas = await provider.getKeywordIdeas(
      [
        'установка брекетов под ключ санкт-петербург цена',
        'купить установка брекетов под ключ санкт-петербург',
      ],
      ['RU-SPB'],
    );
    expect(ideas).toHaveLength(2);
    expect(ideas.map((item) => item.phrase)).toEqual([
      'установка брекетов под ключ санкт-петербург цена',
      'купить установка брекетов под ключ санкт-петербург',
    ]);
  });

  it('does not append second «заказать» to seeds that already have it', async () => {
    const seed = 'заказать выезд мастера в день обращения';
    const ideas = await provider.getKeywordIdeas([seed], ['RU-MOW']);
    const phrases = ideas.map((item) => item.phrase);
    expect(phrases).toEqual([seed]);
    expect(phrases.some((p) => (p.match(/заказать/g) ?? []).length > 1)).toBe(
      false,
    );
  });
});
