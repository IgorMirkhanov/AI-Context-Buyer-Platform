import {
  buildCampaignDraft,
  CampaignDraftValidationError,
  validateCampaignDraft,
} from '@context-buyer/agents';
import {
  MockGoogleAdsApi,
  MockKeywordIdeasProvider,
  MockYandexDirectApi,
  PlatformApiError,
  GoogleAdsConnector,
  YandexDirectConnector,
} from '@context-buyer/connectors';

const input = {
  projectName: 'Asus Gaming',
  websiteUrl: 'https://asus-gaming.example',
  geo: ['RU-MOW'],
  budgetDaily: 5000,
  currency: 'RUB',
  global_negatives: ['бесплатно'],
  clusters: [
    {
      name: 'Asus ROG',
      keywords: ['купить asus rog'],
      negative_keywords: ['купить hp omen'],
      ads: [
        {
          ab_group: 'A',
          creative_ids: ['c1'],
          headline1: 'Игровые ноутбуки Asus',
          headline2: 'Гарантия 3 года',
          description: 'Официальный магазин. Склад в Москве',
          sitelinks: ['Каталог ROG'],
          callouts: ['Гарантия 3 года'],
        },
        {
          ab_group: 'B',
          creative_ids: ['c2'],
          headline1: 'Asus ROG купить',
          headline2: 'Доставка по РФ',
          description: 'Trade-in старого устройства',
          sitelinks: ['Рассрочка'],
          callouts: ['Бесплатная доставка'],
        },
      ],
    },
  ],
};

describe('Campaign Builder', () => {
  it('builds a pending campaign_draft from semantic_core + ads + brief', () => {
    const draft = buildCampaignDraft(input);
    const unit = draft.campaigns[0];
    expect(unit.campaign.initial_status).toBe('paused');
    expect(unit.campaign.budget_daily).toBe(5000);
    expect(unit.campaign.geo).toEqual(['RU-MOW']);
    expect(draft.campaigns).toHaveLength(1);
    expect(draft.campaigns[0].ad_groups).toHaveLength(1);
    expect(draft.campaigns[0].ad_groups[0].ads).toHaveLength(2);
    expect(draft.campaigns[0].ad_groups[0].keywords).toContain('купить asus rog');
    expect(draft.campaigns[0].publish?.step).toBe('idle');
    expect(() => validateCampaignDraft(draft)).not.toThrow(
      CampaignDraftValidationError,
    );
  });
});

describe('Yandex Direct publish pipeline (mock API)', () => {
  const auth = { accessToken: 'sandbox-token', clientLogin: 'direct-login' };
  const oauth = {
    exchangeAuthorizationCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    getAccountLogin: jest.fn(),
  };

  function connector(api: MockYandexDirectApi) {
    return new YandexDirectConnector(
      {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost:3001/oauth/yandex/callback',
      },
      oauth,
      new MockKeywordIdeasProvider(),
      api,
    );
  }

  it('runs createCampaign → groups → ads → keywords without a live account', async () => {
    const api = new MockYandexDirectApi();
    const yandex = connector(api);
    const draft = buildCampaignDraft(input);
    const unit = draft.campaigns[0];
    const campaignId = await yandex.createCampaign('project-1', {
      campaign: unit.campaign,
      ad_groups: unit.ad_groups,
      global_negatives: draft.global_negatives,
    }, auth);
    const groupIds = await yandex.createAdGroups(
      'project-1',
      campaignId,
      unit.ad_groups.map((group) => ({
        name: group.name,
        geo: unit.campaign.geo,
      })),
      auth,
    );
    await yandex.createAds(
      'project-1',
      groupIds[0],
      unit.ad_groups[0].ads,
      auth,
    );
    await yandex.addKeywords(
      'project-1',
      groupIds[0],
      unit.ad_groups[0].keywords,
      auth,
    );
    await yandex.addNegativeKeywords(
      'project-1',
      { type: 'ad_group', id: groupIds[0] },
      unit.ad_groups[0].negative_keywords,
      auth,
    );
    await yandex.setBudget(
      'project-1',
      campaignId,
      unit.campaign.budget_daily,
      auth,
    );
    expect(api.calls.map((item) => item.method)).toEqual(
      expect.arrayContaining([
        'createCampaign',
        'suspendCampaign',
        'createAdGroups',
        'createAds',
        'addKeywords',
        'setBudget',
      ]),
    );
  });

  it('keeps a created campaign paused when a later step fails', async () => {
    const api = new MockYandexDirectApi();
    const yandex = connector(api);
    const draft = buildCampaignDraft(input);
    const unit = draft.campaigns[0];
    const campaignId = await yandex.createCampaign(
      'project-1',
      {
        campaign: unit.campaign,
        ad_groups: unit.ad_groups,
        global_negatives: draft.global_negatives,
      },
      auth,
    );
    api.failAt = 'createAdGroups';
    await expect(
      yandex.createAdGroups(
        'project-1',
        campaignId,
        [{ name: 'Asus ROG', geo: ['RU-MOW'] }],
        auth,
      ),
    ).rejects.toBeInstanceOf(PlatformApiError);
    await yandex.ensurePaused('project-1', campaignId, auth);
    const suspends = api.calls.filter(
      (item) => item.method === 'suspendCampaign',
    );
    expect(suspends.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Google Ads publish pipeline (mock API, same Campaign Builder output)', () => {
  const auth = { accessToken: 'google-token', clientLogin: '1234567890' };
  const oauth = {
    exchangeAuthorizationCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    listCustomerIds: jest.fn(),
  };

  function connector(api: MockGoogleAdsApi) {
    return new GoogleAdsConnector(
      {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost:3001/oauth/google-ads/callback',
        developerToken: 'dev-token',
      },
      oauth,
      new MockKeywordIdeasProvider(),
      api,
    );
  }

  it('publishes buildCampaignDraft output without changing agents', async () => {
    const api = new MockGoogleAdsApi();
    const google = connector(api);
    const draft = buildCampaignDraft(input);
    const unit = draft.campaigns[0];
    const campaignId = await google.createCampaign(
      'project-1',
      {
        campaign: unit.campaign,
        ad_groups: unit.ad_groups,
        global_negatives: draft.global_negatives,
      },
      auth,
    );
    const groupIds = await google.createAdGroups(
      'project-1',
      campaignId,
      unit.ad_groups.map((group) => ({
        name: group.name,
        geo: unit.campaign.geo,
      })),
      auth,
    );
    await google.createAds(
      'project-1',
      groupIds[0],
      unit.ad_groups[0].ads,
      auth,
    );
    await google.addKeywords(
      'project-1',
      groupIds[0],
      unit.ad_groups[0].keywords,
      auth,
    );
    await google.addNegativeKeywords(
      'project-1',
      { type: 'ad_group', id: groupIds[0] },
      unit.ad_groups[0].negative_keywords,
      auth,
    );
    await google.setBudget(
      'project-1',
      campaignId,
      unit.campaign.budget_daily,
      auth,
    );
    expect(api.calls.map((item) => item.method)).toEqual(
      expect.arrayContaining([
        'createBudget',
        'createCampaign',
        'pauseCampaign',
        'createAdGroups',
        'createAds',
        'addKeywords',
        'setBudget',
      ]),
    );
  });

  it('keeps a created campaign paused when a later step fails', async () => {
    const api = new MockGoogleAdsApi();
    const google = connector(api);
    const draft = buildCampaignDraft(input);
    const unit = draft.campaigns[0];
    const campaignId = await google.createCampaign(
      'project-1',
      {
        campaign: unit.campaign,
        ad_groups: unit.ad_groups,
        global_negatives: draft.global_negatives,
      },
      auth,
    );
    api.failAt = 'createAdGroups';
    await expect(
      google.createAdGroups(
        'project-1',
        campaignId,
        [{ name: 'Asus ROG', geo: ['RU-MOW'] }],
        auth,
      ),
    ).rejects.toBeInstanceOf(PlatformApiError);
    await google.ensurePaused('project-1', campaignId, auth);
    const pauses = api.calls.filter((item) => item.method === 'pauseCampaign');
    expect(pauses.length).toBeGreaterThanOrEqual(2);
  });
});
