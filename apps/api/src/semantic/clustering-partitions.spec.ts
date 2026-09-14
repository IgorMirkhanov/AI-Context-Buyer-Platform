import {
  clusteringPartitionKey,
  isPhraseOnNiche,
  productFamilyFromPhrase,
  sanitizeBriefNegatives,
  serviceTypeFromPhrase,
  shouldCrossMinusPhrase,
} from '@context-buyer/agents';

describe('service + product clustering partitions', () => {
  it('splits purchase vs install for the same product', () => {
    expect(serviceTypeFromPhrase('купить кондиционер')).toBe('purchase');
    expect(serviceTypeFromPhrase('установка кондиционера')).toBe('install');
    expect(serviceTypeFromPhrase('монтаж сплит системы')).toBe('install');
    expect(clusteringPartitionKey('купить кондиционер')).not.toBe(
      clusteringPartitionKey('установка кондиционера'),
    );
  });

  it('keeps split-system and conder in different families', () => {
    expect(productFamilyFromPhrase('купить сплит систему')).toBe(
      'family:split_system',
    );
    expect(productFamilyFromPhrase('кондер в квартиру')).toBe('family:conder');
    expect(productFamilyFromPhrase('купить кондиционер')).toBe(
      'family:conditioner',
    );
    expect(productFamilyFromPhrase('кондиционер')).not.toBe(
      productFamilyFromPhrase('кондер'),
    );
  });

  it('keeps bare product queries with purchase, not install', () => {
    expect(clusteringPartitionKey('сплит система')).toBe(
      clusteringPartitionKey('купить сплит систему'),
    );
    expect(clusteringPartitionKey('сплит система')).not.toBe(
      clusteringPartitionKey('установка сплит системы'),
    );
  });

  it('splits refill/clean from purchase', () => {
    expect(serviceTypeFromPhrase('заправка кондиционера цена')).toBe('refill');
    expect(serviceTypeFromPhrase('мойка кондиционера цена')).toBe('clean');
    expect(clusteringPartitionKey('заправка кондиционера цена')).not.toBe(
      clusteringPartitionKey('купить кондиционер'),
    );
  });
});

describe('niche + safe negatives', () => {
  const brief = {
    geo: ['KZ-ALA'],
    usp: ['продажа и монтаж кондиционеров'],
    target_audience: [{ segment: 'владельцы квартир' }],
    global_negative_keywords: [
      'бесплатно',
      'кондиционер',
      'купить',
      'монтаж',
      'гинекология',
    ],
    product_description: 'сплит системы и кондеры под ключ',
  };

  it('drops off-niche phrases and keeps HVAC', () => {
    expect(isPhraseOnNiche('купить кондиционер', brief)).toBe(true);
    expect(isPhraseOnNiche('кондер цена', brief)).toBe(true);
    expect(isPhraseOnNiche('гинекология москва', brief)).toBe(false);
    expect(isPhraseOnNiche('шторы москва', brief)).toBe(false);
  });

  it('strips commercial core from brief negatives', () => {
    const cleaned = sanitizeBriefNegatives(brief.global_negative_keywords, brief);
    expect(cleaned).toContain('бесплатно');
    expect(cleaned).toContain('гинекология');
    expect(cleaned).not.toContain('кондиционер');
    expect(cleaned).not.toContain('купить');
    expect(cleaned).not.toContain('монтаж');
  });
});
