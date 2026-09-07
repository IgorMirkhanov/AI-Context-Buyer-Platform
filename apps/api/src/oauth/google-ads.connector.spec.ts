import {
  GoogleAdsConnector,
  GoogleOAuthClient,
  MockGoogleAdsApi,
  MockKeywordIdeasProvider,
  PlatformApiError,
} from '@context-buyer/connectors';

describe('GoogleAdsConnector OAuth', () => {
  const oauth: GoogleOAuthClient = {
    exchangeAuthorizationCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    listCustomerIds: jest.fn(),
  };

  const connector = new GoogleAdsConnector(
    {
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'http://localhost:3001/oauth/google-ads/callback',
      developerToken: 'dev-token',
    },
    oauth,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('points mock OAuth at the local callback instead of Google', async () => {
    const mock = new GoogleAdsConnector(
      {
        clientId: 'e2e-mock',
        clientSecret: 'e2e-mock',
        redirectUri: 'http://localhost:3001/oauth/google-ads/callback',
        developerToken: 'dev-token',
        mock: true,
      },
      oauth,
    );
    const { url } = await mock.authorize('signed-state');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'http://localhost:3001/oauth/google-ads/callback',
    );
    expect(parsed.searchParams.get('code')).toBe('mock-google');
    expect(parsed.searchParams.get('state')).toBe('signed-state');
  });

  it('builds an authorize URL with client_id, offline access and adwords scope', async () => {
    const { url } = await connector.authorize('project-1');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(parsed.searchParams.get('client_id')).toBe('google-client');
    expect(parsed.searchParams.get('state')).toBe('project-1');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('scope')).toContain('adwords');
  });

  it('exchanges the callback code via the mocked provider', async () => {
    (oauth.exchangeAuthorizationCode as jest.Mock).mockResolvedValue({
      access_token: 'access-from-google',
      refresh_token: 'refresh-from-google',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/adwords',
    });
    (oauth.listCustomerIds as jest.Mock).mockResolvedValue(['9876543210']);

    const creds = await connector.handleOAuthCallback(
      'project-1',
      'auth-code-from-google',
    );

    expect(oauth.exchangeAuthorizationCode).toHaveBeenCalledWith(
      'auth-code-from-google',
    );
    expect(oauth.listCustomerIds).toHaveBeenCalledWith('access-from-google');
    expect(creds.externalAccountId).toBe('9876543210');
    expect(creds.accessToken).toBe('access-from-google');
    expect(creds.refreshToken).toBe('refresh-from-google');
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
      access_token: 'rotated-google',
      expires_in: 3600,
    });
    const creds = await connector.refreshAccessToken(
      'project-1',
      'existing-google-refresh',
    );
    expect(oauth.refreshAccessToken).toHaveBeenCalledWith(
      'existing-google-refresh',
    );
    expect(creds.accessToken).toBe('rotated-google');
    expect(creds.refreshToken).toBe('existing-google-refresh');
    expect(creds.externalAccountId).toBe('');
  });

  it('creates a paused campaign through the Google Ads API mock', async () => {
    const api = new MockGoogleAdsApi();
    const writing = new GoogleAdsConnector(
      {
        clientId: 'google-client',
        clientSecret: 'google-secret',
        redirectUri: 'http://localhost:3001/oauth/google-ads/callback',
        developerToken: 'dev-token',
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
      { accessToken: 'token', clientLogin: '1234567890' },
    );
    expect(id).toMatch(/^\d+$/);
    expect(api.calls.some((item) => item.method === 'pauseCampaign')).toBe(
      true,
    );
    expect(
      api.calls.find((item) => item.method === 'createCampaign')?.payload,
    ).toEqual(
      expect.objectContaining({ status: 'PAUSED' }),
    );
  });

  it('surfaces Google policy errors instead of swallowing them', async () => {
    const api = new MockGoogleAdsApi();
    api.failAt = 'createAdGroups';
    const writing = new GoogleAdsConnector(
      {
        clientId: 'google-client',
        clientSecret: 'google-secret',
        redirectUri: 'http://localhost:3001/oauth/google-ads/callback',
        developerToken: 'dev-token',
      },
      oauth,
      new MockKeywordIdeasProvider(),
      api,
    );
    await expect(
      writing.createAdGroups(
        'project-1',
        '7001',
        [{ name: 'Asus', geo: ['RU-MOW'] }],
        { accessToken: 'token', clientLogin: '1234567890' },
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
