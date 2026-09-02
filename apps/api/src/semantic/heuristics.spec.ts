import {
  deriveMasksFromUsp,
  filterKeywordIdeas,
  isCommercialKeyword,
  masksFromBrief,
  phraseClusteringCore,
  phraseMatchesNegatives,
  SemanticBriefInput,
} from '@context-buyer/agents';

const gamingBrief: SemanticBriefInput = {
  website_url: 'https://asus-gaming.example',
  geo: ['RU-MOW'],
  usp: ['игровые ноутбуки asus', 'гарантия 3 года'],
  target_audience: [{ segment: 'геймеры 18-30' }],
  global_negative_keywords: ['бесплатно', 'скачать'],
  price_segment: 'premium',
};

describe('masksFromBrief', () => {
  it('does not use audience segment or website host as masks', () => {
    const masks = masksFromBrief(gamingBrief, '');
    expect(masks.some((mask) => mask.includes('геймер'))).toBe(false);
    expect(masks.some((mask) => mask.includes('asus-gaming'))).toBe(false);
  });

  it('derives singular and brand masks from product USP', () => {
    const masks = masksFromBrief(gamingBrief, '');
    expect(masks).toEqual(
      expect.arrayContaining([
        'игровые ноутбуки asus',
        'игровой ноутбук asus',
        'ноутбук asus',
        'asus',
        'asus rog',
      ]),
    );
  });

  it('does not derive tail mask from non-adjective USP', () => {
    expect(deriveMasksFromUsp('гарантия 3 года')).not.toContain('3 года');
  });

  it('adds combined geo+price masks as single phrases', () => {
    const clinicBrief: SemanticBriefInput = {
      website_url: 'https://clinic.example',
      geo: ['RU-SPB'],
      usp: ['установка брекетов под ключ'],
      target_audience: [{ segment: 'взрослые' }],
      global_negative_keywords: [],
    };
    const masks = masksFromBrief(clinicBrief, '');
    expect(masks).toEqual(
      expect.arrayContaining([
        'установка брекетов под ключ санкт-петербург цена',
        'установка брекетов под ключ санкт-петербург стоимость',
        'купить установка брекетов под ключ санкт-петербург',
      ]),
    );
  });
});

describe('isCommercialKeyword', () => {
  it('marks hot and price triggers as commercial', () => {
    expect(isCommercialKeyword('установка брекетов под ключ', 'hot')).toBe(true);
    expect(isCommercialKeyword('брекеты цена', 'warm')).toBe(true);
    expect(isCommercialKeyword('записаться на брекеты', 'hot')).toBe(true);
  });

  it('excludes navigational and review phrases', () => {
    expect(
      isCommercialKeyword('установка брекетов обзор', 'warm'),
    ).toBe(false);
    expect(
      isCommercialKeyword('клиника отзывы', 'warm'),
    ).toBe(false);
    expect(
      isCommercialKeyword('клиника официальный сайт', 'navigational'),
    ).toBe(false);
  });
});

describe('phraseClusteringCore', () => {
  it('strips commercial and navigational tails for embedding', () => {
    expect(phraseClusteringCore('asus rog официальный сайт')).toBe('asus rog');
    expect(phraseClusteringCore('hp omen обзор')).toBe('hp omen');
    expect(phraseClusteringCore('купить asus rog')).toBe('asus rog');
    expect(phraseClusteringCore('игровые ноутбуки asus цена')).toBe(
      'игровые ноутбуки asus',
    );
  });

  it('keeps distinct product cores apart', () => {
    expect(phraseClusteringCore('asus rog официальный сайт')).not.toBe(
      phraseClusteringCore('hp omen официальный сайт'),
    );
  });
});

describe('filterKeywordIdeas', () => {
  it('drops service repair phrases and global negatives', () => {
    const filtered = filterKeywordIdeas(
      [
        {
          phrase: 'игровые ноутбуки asus ремонт',
          frequency: 80,
          source: 'mock',
        },
        {
          phrase: 'игровые ноутбуки asus бесплатно',
          frequency: 0,
          source: 'mock',
        },
        { phrase: 'купить ноутбук asus', frequency: 900, source: 'mock' },
      ],
      ['бесплатно', 'скачать'],
    );
    expect(filtered.map((item) => item.phrase)).toEqual([
      'купить ноутбук asus',
    ]);
  });

  it('matches single-token negatives', () => {
    expect(phraseMatchesNegatives('ноутбук скачать asus', ['скачать'])).toBe(
      true,
    );
  });
});
