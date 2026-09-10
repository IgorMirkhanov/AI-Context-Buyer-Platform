/** Strip secrets / tokens from log messages (cursorrules §6). */
const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-+=/]+/gi,
  /\b(access_token|refresh_token|id_token|client_secret|api_key|apikey|password|authorization|token_encryption_key|jwt_secret)\b\s*[:=]\s*["']?[^"'\s,}\]]+/gi,
  /\by[0-9a-zA-Z._-]{20,}\b/g, // Yandex OAuth-ish
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}
