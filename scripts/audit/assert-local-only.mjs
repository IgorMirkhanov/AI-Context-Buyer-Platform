/** Abort token-decrypt audit helpers outside local/dev. */
export function assertAuditScriptsAllowed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'scripts/audit/* that decrypt tokens must not run with NODE_ENV=production',
    );
  }
  if (process.env.ALLOW_TOKEN_AUDIT !== '1' && process.env.CI === 'true') {
    throw new Error(
      'Token audit scripts require ALLOW_TOKEN_AUDIT=1 in CI',
    );
  }
}
