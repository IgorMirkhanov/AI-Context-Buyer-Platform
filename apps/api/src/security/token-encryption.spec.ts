import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from './token-encryption';

describe('token encryption (AES-256-GCM)', () => {
  const key = parseTokenEncryptionKey(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );

  it('round-trips an OpenAI-shaped API key', () => {
    const apiKey = 'sk-proj-example-secret-value';
    const encrypted = encryptSecret(apiKey, key);
    expect(encrypted).not.toContain(apiKey);
    expect(decryptSecret(encrypted, key)).toBe(apiKey);
  });

  it('produces different ciphertext for the same plaintext', () => {
    const token = 'refresh-token-example';
    expect(encryptSecret(token, key)).not.toBe(encryptSecret(token, key));
  });

  it('rejects a 32-byte key that is not hex/base64 of length 32', () => {
    expect(() => parseTokenEncryptionKey('short')).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    );
  });

  it('accepts base64 32-byte keys', () => {
    const raw = Buffer.alloc(32, 7).toString('base64');
    const parsed = parseTokenEncryptionKey(raw);
    expect(parsed.length).toBe(32);
    expect(decryptSecret(encryptSecret('abc', parsed), parsed)).toBe('abc');
  });
});
