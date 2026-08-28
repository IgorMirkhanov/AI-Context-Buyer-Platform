import { BriefValidationError, validateProjectBrief } from './brief.validator';

const validBrief = {
  project: {
    website_url: 'https://example.com',
    geo: ['RU-MOW'],
    budget: { daily: 5000, currency: 'RUB' },
  },
  marketing: {
    usp: ['Гарантия 3 года'],
    target_audience: [{ segment: 'Геймеры 18-30' }],
  },
  exclusions: {
    global_negative_keywords: ['бесплатно', 'скачать'],
  },
};

describe('project brief JSON schema', () => {
  it('accepts the Stage 1 payload', () => {
    expect(() => validateProjectBrief(validBrief)).not.toThrow();
  });

  it('rejects missing website_url', () => {
    const invalid = structuredClone(validBrief);
    // @ts-expect-error testing schema
    delete invalid.project.website_url;
    expect(() => validateProjectBrief(invalid)).toThrow(BriefValidationError);
  });

  it('rejects empty geo', () => {
    const invalid = structuredClone(validBrief);
    invalid.project.geo = [];
    expect(() => validateProjectBrief(invalid)).toThrow(BriefValidationError);
  });

  it('rejects zero budget', () => {
    const invalid = structuredClone(validBrief);
    invalid.project.budget.daily = 0;
    expect(() => validateProjectBrief(invalid)).toThrow(BriefValidationError);
  });

  it('rejects empty USP', () => {
    const invalid = structuredClone(validBrief);
    invalid.marketing.usp = [];
    expect(() => validateProjectBrief(invalid)).toThrow(BriefValidationError);
  });
});
