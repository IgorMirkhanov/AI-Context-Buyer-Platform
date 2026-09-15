import {
  sanitizeGoogleKeywordText,
  sanitizeGoogleKeywords,
} from '@context-buyer/connectors';

describe('sanitizeGoogleKeywordText', () => {
  it('keeps cyrillic and hyphens', () => {
    expect(sanitizeGoogleKeywordText('  ford f-150 raptor цена  ')).toBe(
      'ford f-150 raptor цена',
    );
  });

  it('strips invalid symbols that trigger KEYWORD_HAS_INVALID_CHARS', () => {
    expect(sanitizeGoogleKeywordText('сайт (под ключ)! @150%')).toBe(
      'сайт под ключ 150',
    );
  });

  it('enforces 10-word limit', () => {
    const long = Array.from({ length: 12 }, (_, i) => `слово${i}`).join(' ');
    const cleaned = sanitizeGoogleKeywordText(long);
    expect(cleaned?.split(' ')).toHaveLength(10);
  });

  it('dedupes keyword lists case-insensitively', () => {
    expect(
      sanitizeGoogleKeywords(['Купить сайт', 'купить сайт', '!!!', 'заказ']),
    ).toEqual(['Купить сайт', 'заказ']);
  });
});
