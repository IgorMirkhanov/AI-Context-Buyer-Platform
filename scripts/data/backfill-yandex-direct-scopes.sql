-- Backfill empty Yandex Direct OAuth scopes (one-off data fix).
--
-- Problem: scopes was saved as '' when Yandex omitted scope in token response
-- and YANDEX_OAUTH_SCOPE was not configured.
--
-- DO NOT run automatically. Review affected rows first, then execute manually.
--
-- 1) Preview rows that will be updated:
SELECT id, project_id, platform, external_account_id, scopes, created_at
FROM ad_platform_credentials
WHERE platform = 'yandex_direct'
  AND (scopes IS NULL OR scopes = '');

-- 2) Apply (only after you confirm the preview):
-- UPDATE ad_platform_credentials
-- SET scopes = 'direct:api'
-- WHERE platform = 'yandex_direct'
--   AND (scopes IS NULL OR scopes = '');
