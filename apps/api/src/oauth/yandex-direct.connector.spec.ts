import {
  MockKeywordIdeasProvider,
  MockYandexDirectApi,
  PlatformApiError,
  YandexDirectConnector,
  YandexOAuthClient,
} from '@context-buyer/connectors';

describe('YandexDirectConnector OAuth', () => {
  const oauth: YandexOAuthClient = {
    exchangeAuthorizationCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    getAccountLogin: jest.fn(),
  };

  const connector = new YandexDirectConnector(
    {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'http://localhost:3001/oauth/yandex/callback',
    },
    oauth,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('points mock OAuth at the local callback instead of Yandex', async () => {
    const mock = new YandexDirectConnector(
      {
        clientId: 'e2e-mock',
        clientSecret: 'e2e-mock',
        redirectUri: 'http://localhost:3001/oauth/yandex/callback',
        mock: true,
      },
      oauth,
    );
    const { url } = await mock.authorize('signed-state');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'http://localhost:3001/oauth/yandex/callback',
    );
    expect(parsed.searchParams.get('code')).toBe('mock-yandex');
    expect(parsed.searchParams.get('state')).toBe('signed-state');
  });

  it('builds an authorize URL with client_id and state', async () => {
    const { url } = await connector.authorize('project-1');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://oauth.yandex.ru/authorize',
    );
    expect(parsed.searchParams.get('client_id')).toBe('test-client');
    expect(parsed.searchParams.get('state')).toBe('project-1');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('exchanges the callback code via the mocked provider', async () => {
    (oauth.exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      access_token: 'access-from-yandex',
      refresh_token: 'refresh-from-yandex',
      expires_in: 3600,
      scope: 'direct:api',
    });
    (oauth.getAccountLogin as jest.Mock).mockResolvedValue('agency-login');

    const creds = await connector.handleOAuthCallback(
      'project-1',
      'auth-code-from-yandex',
    );

    expect(oauth.exchangeAuthorizationCode).toHaveBeenCalledWith(
      'auth-code-from-yandex',
    );
    expect(oauth.getAccountLogin).toHaveBeenCalledWith('access-from-yandex');
    expect(creds.externalAccountId).toBe('agency-login');
    expect(creds.accessToken).toBe('access-from-yandex');
    expect(creds.refreshToken).toBe('refresh-from-yandex');
    expect(creds.scopes).toBe('direct:api');
  });

  it('fails closed when the provider omits access_token', async () => {
    (oauth.exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      refresh_token: 'only-refresh',
    });
    await expect(
      connector.handleOAuthCallback('project-1', 'code'),
    ).rejects.toThrow(/access token/);
  });

  it('rotates the access token and keeps the old refresh token if omitted', async () => {
    (oauth.refreshAccessToken as jest.Mock).mockResolvedValue({
      access_token: 'rotated-access',
      expires_in: 3600,
      scope: 'direct:api',
    });
    const creds = await connector.refreshAccessToken(
      'project-1',
      'existing-refresh',
    );
    expect(oauth.refreshAccessToken).toHaveBeenCalledWith('existing-refresh');
    expect(creds.accessToken).toBe('rotated-access');
    expect(creds.refreshToken).toBe('existing-refresh');
    expect(creds.externalAccountId).toBe('');
  });

  it('creates a paused campaign through the Direct API mock', async () => {
    const api = new MockYandexDirectApi();
    const writing = new YandexDirectConnector(
      {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3001/oauth/yandex/callback',
      },
      oauth,
      new MockKeywordIdeasProvider(),
      api,
    );
    const id = await writing.createCampaign(
      'project-1',
      {
        campaign: {
          name: 'Asus — Search — RU-MOW',
          budget_daily: 5000,
          geo: ['RU-MOW'],
        },
      },
      { accessToken: 'token', clientLogin: 'agency-login' },
    );
    expect(id).toMatch(/^\d+$/);
    expect(api.calls.some((item) => item.method === 'suspendCampaign')).toBe(
      true,
    );
  });

  it('surfaces Direct policy errors instead of swallowing them', async () => {
    const api = new MockYandexDirectApi();
    api.failAt = 'createAdGroups';
    const writing = new YandexDirectConnector(
      {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3001/oauth/yandex/callback',
      },
      oauth,
      new MockKeywordIdeasProvider(),
      api,
    );
    await expect(
      writing.createAdGroups(
        'project-1',
        '1001',
        [{ name: 'Asus', geo: ['RU-MOW'] }],
        { accessToken: 'token' },
      ),
    ).rejects.toBeInstanceOf(PlatformApiError);
  });

  it('returns mock keyword ideas for Semantic Agent', async () => {
    const ideas = await connector.getKeywordIdeas(['ноутбук asus'], ['RU-MOW']);
    expect(ideas.length).toBeGreaterThan(3);
    expect(ideas.every((item) => typeof item.frequency === 'number')).toBe(
      true,
    );
  });
});
