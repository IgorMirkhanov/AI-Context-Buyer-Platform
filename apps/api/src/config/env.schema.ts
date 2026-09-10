import { z } from 'zod';

const optionalString = z.string().optional();

/** Raw process.env shape used by the API (subset we care about). */
export const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  API_PORT: optionalString,
  WEB_ORIGIN: optionalString,
  JWT_SECRET: optionalString,
  JWT_EXPIRES_IN: optionalString,
  TOKEN_ENCRYPTION_KEY: optionalString,
  DATABASE_URL: optionalString,
  REDIS_URL: optionalString,
  PIPELINE_QUEUE: optionalString,
  GOOGLE_ADS_MOCK: optionalString,
  GOOGLE_ADS_CLIENT_ID: optionalString,
  GOOGLE_ADS_CLIENT_SECRET: optionalString,
  GOOGLE_ADS_DEVELOPER_TOKEN: optionalString,
  GOOGLE_ADS_REDIRECT_URI: optionalString,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalString,
  YANDEX_DIRECT_MOCK: optionalString,
  YANDEX_CLIENT_ID: optionalString,
  YANDEX_CLIENT_SECRET: optionalString,
  YANDEX_REDIRECT_URI: optionalString,
  /** Optional Slack/Telegram (or similar) webhook for critical ops_alerts. */
  ALERT_WEBHOOK_URL: optionalString,
});

export type EnvSchema = z.infer<typeof envSchema>;

export function isMockFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase() ?? '';
  return v === '1' || v === 'true' || v === 'yes';
}

/** Yandex live when mock env is empty / unset / anything other than 1|true. */
export function isYandexLive(raw: string | undefined): boolean {
  return !isMockFlag(raw);
}

export function isGoogleLive(raw: string | undefined): boolean {
  return !isMockFlag(raw);
}

export function isProduction(nodeEnv: string | undefined): boolean {
  return (nodeEnv ?? '').trim().toLowerCase() === 'production';
}
