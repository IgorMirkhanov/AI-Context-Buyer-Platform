import {
  MockGoogleAdsApi,
  MockYandexDirectApi,
  YandexDirectConnector,
  GoogleAdsConnector,
  createMockYandexOAuthClient,
  createGoogleOAuthClient,
} from '@context-buyer/connectors';

describe('AdPlatformConnector.verifyConnection', () => {
  it('returns ok for Yandex mock probe', async () => {
    const connector = new YandexDirectConnector(
      {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/callback',
        mock: true,
      },
      createMockYandexOAuthClient(),
      undefined,
      new MockYandexDirectApi(),
    );
    const result = await connector.verifyConnection('project-1', {
      accessToken: 'token',
      clientLogin: 'login',
      projectId: 'project-1',
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns needs reconnect when Yandex mock probe fails', async () => {
    const api = new MockYandexDirectApi();
    api.failAt = 'verifyConnection';
    const connector = new YandexDirectConnector(
      {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/callback',
        mock: true,
      },
      createMockYandexOAuthClient(),
      undefined,
      api,
    );
    const result = await connector.verifyConnection('project-1', {
      accessToken: 'token',
      clientLogin: 'login',
      projectId: 'project-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/invalid oauth token/i);
    }
  });

  it('returns needs reconnect when Google mock probe fails', async () => {
    const api = new MockGoogleAdsApi();
    api.failAt = 'verifyConnection';
    const connector = new GoogleAdsConnector(
      {
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/callback',
        developerToken: 'dev',
      },
      createGoogleOAuthClient({
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/callback',
        developerToken: 'dev',
      }),
      undefined,
      api,
    );
    const result = await connector.verifyConnection('project-1', {
      accessToken: 'token',
      clientLogin: '1234567890',
      projectId: 'project-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/insufficient authentication scopes/i);
    }
  });
});
