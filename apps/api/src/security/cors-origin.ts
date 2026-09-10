/**
 * Resolve CORS origin for Nest enableCors.
 * Never allows wildcard `*`. Production requires a concrete https origin
 * (not localhost) — mirrors validateEnv, but fails closed in code path too.
 */
export function resolveCorsOrigin(
  nodeEnv: string | undefined,
  webOrigin: string | undefined,
): string {
  const prod = (nodeEnv ?? '').trim().toLowerCase() === 'production';
  const origin = (webOrigin ?? '').trim() || (prod ? '' : 'http://localhost:3000');

  if (!origin || origin === '*') {
    throw new Error(
      'WEB_ORIGIN must be a concrete origin (wildcard "*" is not allowed)',
    );
  }

  if (prod) {
    if (!/^https:\/\//i.test(origin)) {
      throw new Error('WEB_ORIGIN must use https:// in production');
    }
    if (/localhost|127\.0\.0\.1/i.test(origin)) {
      throw new Error('WEB_ORIGIN must not be localhost in production');
    }
  }

  return origin;
}
