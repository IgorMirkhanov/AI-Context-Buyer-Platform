import { isPlatformRateLimitError, PlatformApiError } from '@context-buyer/connectors';
import { evaluateOpsAlerts, OAUTH_EXPIRING_WITHIN_MS } from '@context-buyer/agents';

describe('evaluateOpsAlerts', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');

  it('stays quiet when the project is healthy', () => {
    expect(
      evaluateOpsAlerts({
        now,
        oauthExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
        pipelineFailed: null,
        rateLimited: false,
      }),
    ).toEqual([]);
  });

  it('warns before OAuth expiry and after it, without including a token', () => {
    const expiring = evaluateOpsAlerts({
      now,
      oauthExpiresAt: new Date(now.getTime() + OAUTH_EXPIRING_WITHIN_MS / 2),
      pipelineFailed: null,
      rateLimited: false,
    });
    expect(expiring.map((item) => item.kind)).toEqual(['oauth_expiring']);
    expect(JSON.stringify(expiring)).not.toMatch(/ya29|AQAAAA|token=/i);

    const expired = evaluateOpsAlerts({
      now,
      oauthExpiresAt: new Date(now.getTime() - 60_000),
      pipelineFailed: null,
      rateLimited: false,
    });
    expect(expired[0].kind).toBe('oauth_expired');
  });

  it('flags a failed pipeline step and a platform rate limit', () => {
    const alerts = evaluateOpsAlerts({
      now,
      oauthExpiresAt: null,
      pipelineFailed: { agent: 'semantic', error: 'Wordstat timeout' },
      rateLimited: true,
      rateLimitDetail: 'HTTP 429',
    });
    expect(alerts.map((item) => item.kind)).toEqual([
      'pipeline_failed',
      'platform_rate_limit',
    ]);
  });

  it('detects platform 429 without treating other errors as rate limits', () => {
    expect(
      isPlatformRateLimitError(
        new PlatformApiError('Too many requests', 'getPerformance', 'HTTP 429', true),
      ),
    ).toBe(true);
    expect(
      isPlatformRateLimitError(new PlatformApiError('Invalid token', 'auth', '401')),
    ).toBe(false);
  });
});
