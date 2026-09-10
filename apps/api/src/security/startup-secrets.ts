/**
 * Fail fast before Nest boots if signing / encryption secrets are missing
 * or too weak. Never fall back to a public default.
 */
export function assertStartupSecrets(env: NodeJS.ProcessEnv = process.env): void {
  assertJwtSecret(env.JWT_SECRET);
  assertTokenEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
}

export function assertJwtSecret(raw: string | undefined): string {
  const secret = raw?.trim() ?? '';
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Set a random secret of at least 32 characters before starting the API.',
    );
  }
  if (secret === 'change-me-in-production') {
    throw new Error(
      'JWT_SECRET still has the insecure placeholder "change-me-in-production". Replace it with a random secret (≥32 chars).',
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters (got ${secret.length}).`,
    );
  }
  return secret;
}

/**
 * Production keys must be exactly 32 bytes: 64 hex chars or base64.
 * Passphrase/scrypt shortcuts are not accepted at process start.
 */
export function assertTokenEncryptionKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate 32 bytes as 64 hex chars, e.g. node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))".',
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  const fromBase64 = Buffer.from(value, 'base64');
  if (fromBase64.length === 32) {
    return fromBase64;
  }
  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters or base64 (not a free-form passphrase).',
  );
}

/** Resolve JWT secret for Nest providers after startup checks passed. */
export function requireJwtSecret(get: (key: string) => string | undefined): string {
  return assertJwtSecret(get('JWT_SECRET'));
}
