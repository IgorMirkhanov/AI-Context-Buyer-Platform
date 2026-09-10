import {
  envSchema,
  isGoogleLive,
  isProduction,
  isYandexLive,
  type EnvSchema,
} from './env.schema';

export class EnvValidationError extends Error {
  constructor(readonly missingOrInvalid: string[]) {
    const list = missingOrInvalid.join(', ');
    super(
      `Invalid environment configuration: ${list}. Fix these variables before starting the API.`,
    );
    this.name = 'EnvValidationError';
  }
}

function requireNonEmpty(
  issues: string[],
  name: string,
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    issues.push(name);
    return undefined;
  }
  return trimmed;
}

/**
 * Validate process env. Safe to call from unit tests without bootstrapping Nest.
 * Production requires secrets + DATABASE_URL + REDIS_URL + https WEB_ORIGIN.
 * Live ad platforms require real OAuth credentials when mock flags are off.
 */
export function validateEnv(
  raw: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): EnvSchema {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((i) => i.path.join('.') || 'env'),
    );
  }

  const env = parsed.data;
  const issues: string[] = [];
  const prod = isProduction(env.NODE_ENV);

  if (prod) {
    const jwt = requireNonEmpty(issues, 'JWT_SECRET', env.JWT_SECRET);
    if (jwt === 'change-me-in-production') {
      issues.push('JWT_SECRET (insecure placeholder "change-me-in-production")');
    } else if (jwt && jwt.length < 32) {
      issues.push('JWT_SECRET (must be at least 32 characters)');
    }

    const tokenKey = requireNonEmpty(
      issues,
      'TOKEN_ENCRYPTION_KEY',
      env.TOKEN_ENCRYPTION_KEY,
    );
    if (tokenKey && !/^[0-9a-fA-F]{64}$/.test(tokenKey)) {
      issues.push('TOKEN_ENCRYPTION_KEY (must be exactly 64 hex characters)');
    }

    requireNonEmpty(issues, 'DATABASE_URL', env.DATABASE_URL);
    requireNonEmpty(issues, 'REDIS_URL', env.REDIS_URL);

    const origin = requireNonEmpty(issues, 'WEB_ORIGIN', env.WEB_ORIGIN);
    if (origin) {
      if (!/^https:\/\//i.test(origin)) {
        issues.push('WEB_ORIGIN (must use https:// in production)');
      }
      if (/localhost|127\.0\.0\.1/i.test(origin)) {
        issues.push('WEB_ORIGIN (must not be localhost in production)');
      }
    }
  }

  if (isGoogleLive(env.GOOGLE_ADS_MOCK)) {
    requireNonEmpty(issues, 'GOOGLE_ADS_CLIENT_ID', env.GOOGLE_ADS_CLIENT_ID);
    requireNonEmpty(
      issues,
      'GOOGLE_ADS_CLIENT_SECRET',
      env.GOOGLE_ADS_CLIENT_SECRET,
    );
    requireNonEmpty(
      issues,
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      env.GOOGLE_ADS_DEVELOPER_TOKEN,
    );
  }

  if (isYandexLive(env.YANDEX_DIRECT_MOCK)) {
    requireNonEmpty(issues, 'YANDEX_CLIENT_ID', env.YANDEX_CLIENT_ID);
    requireNonEmpty(issues, 'YANDEX_CLIENT_SECRET', env.YANDEX_CLIENT_SECRET);
  }

  if (issues.length > 0) {
    // Dedupe while preserving order
    throw new EnvValidationError([...new Set(issues)]);
  }

  return env;
}
