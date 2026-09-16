import {
  LiveGoogleAdsApi,
  LiveGoogleKeywordIdeasProvider,
  PlatformApiError,
  humanizeGoogleError,
  isGoogleAdsAccessLevelError,
  mapGenerateKeywordIdeaResult,
} from '@context-buyer/connectors';

describe('mapGenerateKeywordIdeaResult', () => {
  it('maps phrase, avgMonthlySearches and competition', () => {
    expect(
      mapGenerateKeywordIdeaResult({
        text: 'Купить Ноутбук Asus',
        keywordIdeaMetrics: {
          avgMonthlySearches: '1200',
          competition: 'HIGH',
        },
      }),
    ).toEqual({
      phrase: 'купить ноутбук asus',
      frequency: 1200,
      competition: 'HIGH',
      source: 'google_keyword_planner',
    });
  });

  it('keeps positive volume even when competition is unknown', () => {
    expect(
      mapGenerateKeywordIdeaResult({
        text: 'ноутбук',
        keywordIdeaMetrics: { avgMonthlySearches: '10', competition: 'UNKNOWN' },
      }),
    ).toEqual({
      phrase: 'ноутбук',
      frequency: 10,
      competition: null,
      source: 'google_keyword_planner',
    });
  });

  it('drops rows with zero or missing frequency', () => {
    expect(
      mapGenerateKeywordIdeaResult({
        text: 'ноутбук',
        keywordIdeaMetrics: { avgMonthlySearches: '0', competition: 'LOW' },
      }),
    ).toBeNull();
    expect(
      mapGenerateKeywordIdeaResult({
        text: 'ноутбук',
        keywordIdeaMetrics: { competition: 'LOW' },
      }),
    ).toBeNull();
  });
});

describe('LiveGoogleKeywordIdeasProvider', () => {
  const auth = {
    accessToken: 'ya29.test',
    clientLogin: '123-456-7890',
    projectId: 'proj-1',
  };

  it('maps GenerateKeywordIdeas HTTP response without a real network call', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            text: 'купить ноутбук',
            keywordIdeaMetrics: {
              avgMonthlySearches: '900',
              competition: 'MEDIUM',
            },
          },
          {
            text: 'ноутбук бесплатно',
            keywordIdeaMetrics: {
              avgMonthlySearches: '0',
              competition: 'LOW',
            },
          },
          {
            text: 'ноутбук обзор',
            keywordIdeaMetrics: {
              avgMonthlySearches: '50',
              competition: 'UNSPECIFIED',
            },
          },
        ],
      }),
    });

    const api = new LiveGoogleAdsApi(
      'dev-token',
      undefined,
      'v25',
      fetchImpl as unknown as typeof fetch,
    );
    const provider = new LiveGoogleKeywordIdeasProvider(api);
    const ideas = await provider.getKeywordIdeas(
      ['ноутбук asus'],
      ['RU-MOW'],
      auth,
    );

    expect(ideas).toEqual([
      {
        phrase: 'купить ноутбук',
        frequency: 900,
        competition: 'MEDIUM',
        source: 'google_keyword_planner',
      },
      {
        phrase: 'ноутбук обзор',
        frequency: 50,
        competition: null,
        source: 'google_keyword_planner',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://googleads.googleapis.com/v25/customers/1234567890:generateKeywordIdeas',
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer ya29.test',
      'developer-token': 'dev-token',
    });
    const body = JSON.parse(String(init.body)) as {
      keywordSeed: { keywords: string[] };
      geoTargetConstants: string[];
      language: string;
    };
    expect(body.keywordSeed.keywords).toEqual(['ноутбук asus']);
    // Keyword Planner uses country-level geo (city IDs often INVALID_VALUE).
    expect(body.geoTargetConstants).toEqual(['geoTargetConstants/2643']);
    expect(body.language).toBe('languageConstants/1031');
  });

  it('retries Keyword Planner with empty geo after country INVALID_VALUE', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Request contains an invalid argument.',
            status: 'INVALID_ARGUMENT',
            details: [
              {
                errors: [
                  {
                    errorCode: { keywordPlanIdeaError: 'INVALID_VALUE' },
                    message: 'The input has an invalid value.',
                    location: {
                      fieldPathElements: [{ fieldName: 'geo_target_constants' }],
                    },
                  },
                ],
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              text: 'купить ноутбук',
              keywordIdeaMetrics: {
                avgMonthlySearches: '100',
                competition: 'LOW',
              },
            },
          ],
        }),
      });
    const api = new LiveGoogleAdsApi(
      'dev-token',
      undefined,
      'v25',
      fetchImpl as unknown as typeof fetch,
    );
    const provider = new LiveGoogleKeywordIdeasProvider(api);
    const ideas = await provider.getKeywordIdeas(
      ['ноутбук'],
      ['RU-MOW'],
      auth,
    );
    expect(ideas).toEqual([
      {
        phrase: 'купить ноутбук',
        frequency: 100,
        competition: 'LOW',
        source: 'google_keyword_planner',
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { geoTargetConstants: string[] };
    const secondBody = JSON.parse(
      String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body),
    ) as { geoTargetConstants: string[] };
    expect(firstBody.geoTargetConstants).toEqual(['geoTargetConstants/2643']);
    expect(secondBody.geoTargetConstants).toEqual([]);
  });

  it('falls back to seed phrases when Planner returns no usable metrics', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    });
    const api = new LiveGoogleAdsApi(
      'dev-token',
      undefined,
      'v25',
      fetchImpl as unknown as typeof fetch,
    );
    const provider = new LiveGoogleKeywordIdeasProvider(api);
    const ideas = await provider.getKeywordIdeas(
      ['купить кондиционер москва'],
      ['RU-MOW'],
      auth,
    );
    expect(ideas).toEqual([
      {
        phrase: 'купить кондиционер москва',
        frequency: 1,
        competition: null,
        source: 'google_keyword_planner',
      },
    ]);
  });

  it('surfaces Basic Access / test-account errors with GOOGLE_ADS_MOCK hint', async () => {
    const details =
      'The developer token is only allowed to access test accounts.';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: details, status: 'PERMISSION_DENIED' },
      }),
    });
    const api = new LiveGoogleAdsApi(
      'dev-token',
      undefined,
      'v25',
      fetchImpl as unknown as typeof fetch,
    );
    const provider = new LiveGoogleKeywordIdeasProvider(api);

    await expect(
      provider.getKeywordIdeas(['ноутбук'], ['RU'], auth),
    ).rejects.toBeInstanceOf(PlatformApiError);

    try {
      await provider.getKeywordIdeas(['ноутбук'], ['RU'], auth);
    } catch (err) {
      expect(err).toBeInstanceOf(PlatformApiError);
      const message = (err as PlatformApiError).message;
      expect(isGoogleAdsAccessLevelError(details)).toBe(true);
      expect(message).toContain('GOOGLE_ADS_MOCK=1');
      expect(message).toContain('Basic Access');
      expect(message).toBe(humanizeGoogleError(details));
    }
  });

  it('requires connected Google Ads credentials', async () => {
    const provider = new LiveGoogleKeywordIdeasProvider(
      new LiveGoogleAdsApi('dev-token'),
    );
    await expect(
      provider.getKeywordIdeas(['a'], ['RU']),
    ).rejects.toMatchObject({
      step: 'generateKeywordIdeas',
      message: expect.stringContaining('GOOGLE_ADS_MOCK=1'),
    });
  });
});
