import {
  MockKeywordIdeasProvider,
  seedHasCommercialModifier,
} from '@context-buyer/connectors';

describe('seedHasCommercialModifier (connectors)', () => {
  it('treats any commercial trigger token as already commercial', () => {
    expect(
      seedHasCommercialModifier('заказать выезд мастера в день обращения'),
    ).toBe(true);
    expect(seedHasCommercialModifier('выезд мастера заказать')).toBe(true);
    expect(seedHasCommercialModifier('выезд мастера в день обращения')).toBe(
      false,
    );
  });
});

describe('MockKeywordIdeasProvider — no double «заказать»', () => {
  const provider = new MockKeywordIdeasProvider();

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
