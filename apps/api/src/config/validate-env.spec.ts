import { EnvValidationError, validateEnv } from './validate-env';

const HEX64 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function baseDevEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    JWT_SECRET: 'local-dev-only-replace-with-a-long-random-secret',
    TOKEN_ENCRYPTION_KEY: HEX64,
    YANDEX_DIRECT_MOCK: '1',
    GOOGLE_ADS_MOCK: '1',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('allows development with mocks and without REDIS_URL', () => {
    expect(() => validateEnv(baseDevEnv())).not.toThrow();
  });

  it('fails production when JWT_SECRET is missing (names the variable)', () => {
    expect(() =>
      validateEnv(
        baseDevEnv({
          NODE_ENV: 'production',
          JWT_SECRET: '',
          DATABASE_URL: 'postgresql://u:p@h/db',
          REDIS_URL: 'redis://h:6379',
          WEB_ORIGIN: 'https://app.example.com',
          YANDEX_DIRECT_MOCK: '1',
          GOOGLE_ADS_MOCK: '1',
        }),
      ),
    ).toThrow(/JWT_SECRET/);
  });

  it('fails production on placeholder JWT_SECRET', () => {
    expect(() =>
      validateEnv(
        baseDevEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'change-me-in-production',
          DATABASE_URL: 'postgresql://u:p@h/db',
          REDIS_URL: 'redis://h:6379',
          WEB_ORIGIN: 'https://app.example.com',
          YANDEX_DIRECT_MOCK: '1',
          GOOGLE_ADS_MOCK: '1',
        }),
      ),
    ).toThrow(/JWT_SECRET/);
  });

  it('fails production when TOKEN_ENCRYPTION_KEY is not 64 hex', () => {
    expect(() =>
      validateEnv(
        baseDevEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
          TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
          DATABASE_URL: 'postgresql://u:p@h/db',
          REDIS_URL: 'redis://h:6379',
          WEB_ORIGIN: 'https://app.example.com',
          YANDEX_DIRECT_MOCK: '1',
          GOOGLE_ADS_MOCK: '1',
        }),
      ),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it('fails production when DATABASE_URL or REDIS_URL missing', () => {
    try {
      validateEnv(
        baseDevEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
          WEB_ORIGIN: 'https://app.example.com',
          DATABASE_URL: '',
          REDIS_URL: '',
          YANDEX_DIRECT_MOCK: '1',
          GOOGLE_ADS_MOCK: '1',
        }),
      );
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const msg = (err as Error).message;
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).toMatch(/REDIS_URL/);
    }
  });

  it('fails production when WEB_ORIGIN is localhost or http', () => {
    expect(() =>
      validateEnv(
        baseDevEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
          DATABASE_URL: 'postgresql://u:p@h/db',
          REDIS_URL: 'redis://h:6379',
          WEB_ORIGIN: 'http://localhost:3000',
          YANDEX_DIRECT_MOCK: '1',
          GOOGLE_ADS_MOCK: '1',
        }),
      ),
    ).toThrow(/WEB_ORIGIN/);
  });

  it('requires Google credentials when GOOGLE_ADS_MOCK=0', () => {
    try {
      validateEnv(
        baseDevEnv({
          GOOGLE_ADS_MOCK: '0',
          GOOGLE_ADS_CLIENT_ID: '',
          GOOGLE_ADS_CLIENT_SECRET: '',
          GOOGLE_ADS_DEVELOPER_TOKEN: '',
        }),
      );
      fail('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/GOOGLE_ADS_CLIENT_ID/);
      expect(msg).toMatch(/GOOGLE_ADS_CLIENT_SECRET/);
      expect(msg).toMatch(/GOOGLE_ADS_DEVELOPER_TOKEN/);
    }
  });

  it('requires Yandex credentials when YANDEX_DIRECT_MOCK is empty (live)', () => {
    try {
      validateEnv(
        baseDevEnv({
          YANDEX_DIRECT_MOCK: '',
          YANDEX_CLIENT_ID: '',
          YANDEX_CLIENT_SECRET: '',
        }),
      );
      fail('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/YANDEX_CLIENT_ID/);
      expect(msg).toMatch(/YANDEX_CLIENT_SECRET/);
    }
  });

  it('accepts a complete production env', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(48),
        TOKEN_ENCRYPTION_KEY: HEX64,
        DATABASE_URL: 'postgresql://u:p@db/prod',
        REDIS_URL: 'redis://redis:6379',
        WEB_ORIGIN: 'https://app.example.com',
        YANDEX_DIRECT_MOCK: '1',
        GOOGLE_ADS_MOCK: '1',
      }),
    ).not.toThrow();
  });
});
