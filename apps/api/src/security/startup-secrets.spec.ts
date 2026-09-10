import { assertJwtSecret, assertTokenEncryptionKey } from './startup-secrets';

describe('assertStartupSecrets', () => {
  const goodJwt = 'a'.repeat(32);
  const goodKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('accepts a long JWT secret and 64-hex encryption key', () => {
    expect(assertJwtSecret(goodJwt)).toBe(goodJwt);
    expect(assertTokenEncryptionKey(goodKey)).toHaveLength(32);
  });

  it('rejects missing or placeholder JWT_SECRET', () => {
    expect(() => assertJwtSecret(undefined)).toThrow(/JWT_SECRET is not set/);
    expect(() => assertJwtSecret('change-me-in-production')).toThrow(
      /insecure placeholder/,
    );
    expect(() => assertJwtSecret('too-short')).toThrow(/at least 32/);
  });

  it('rejects missing or passphrase TOKEN_ENCRYPTION_KEY', () => {
    expect(() => assertTokenEncryptionKey(undefined)).toThrow(
      /TOKEN_ENCRYPTION_KEY is not set/,
    );
    expect(() =>
      assertTokenEncryptionKey('this-is-a-passphrase-not-hex-or-base64!!'),
    ).toThrow(/64 hex|base64/);
  });

  it('accepts base64 32-byte encryption keys', () => {
    const raw = Buffer.alloc(32, 9).toString('base64');
    expect(assertTokenEncryptionKey(raw)).toHaveLength(32);
  });
});
