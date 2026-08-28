export const DEFAULT_TOKEN_REFRESH_SKEW_MS = 15 * 60 * 1000;

export function tokenNeedsRefresh(
  expiresAt: Date | null | undefined,
  now: Date,
  skewMs = DEFAULT_TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime() + skewMs;
}
