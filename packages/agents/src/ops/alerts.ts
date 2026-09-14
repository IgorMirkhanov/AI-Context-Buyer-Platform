export const OAUTH_EXPIRING_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Access-токены Google (~1 ч) не должны поднимать «переподключите».
 * Алерт только для долгоживущих сроков (как у Яндекса), пока до истечения > 2 ч.
 */
export const OAUTH_ACCESS_TOKEN_ALERT_FLOOR_MS = 2 * 60 * 60 * 1000;

export type OpsAlertKind =
  | "pipeline_failed"
  | "oauth_expiring"
  | "oauth_expired"
  | "platform_rate_limit";

export type OpsAlertDraft = {
  kind: OpsAlertKind;
  title: string;
  detail: string | null;
};

export type OpsAlertInput = {
  now: Date;
  oauthExpiresAt: Date | null;
  pipelineFailed: { agent: string; error: string | null } | null;
  rateLimited: boolean;
  rateLimitDetail?: string | null;
};

export function evaluateOpsAlerts(input: OpsAlertInput): OpsAlertDraft[] {
  const alerts: OpsAlertDraft[] = [];
  if (input.oauthExpiresAt) {
    const msLeft = input.oauthExpiresAt.getTime() - input.now.getTime();
    // Истёкший / почти истёкший access token — норма; refresh_token обновит.
    // oauth_expired пишется только при реальном сбое refresh.
    if (
      msLeft > OAUTH_ACCESS_TOKEN_ALERT_FLOOR_MS &&
      msLeft <= OAUTH_EXPIRING_WITHIN_MS
    ) {
      alerts.push({
        kind: "oauth_expiring",
        title: "OAuth-токен скоро истечёт",
        detail: `Осталось меньше 7 дней. Переподключите кабинет заранее.`,
      });
    }
  }
  if (input.pipelineFailed) {
    alerts.push({
      kind: "pipeline_failed",
      title: "Пайплайн остановился с ошибкой",
      detail: input.pipelineFailed.error
        ? `${input.pipelineFailed.agent}: ${input.pipelineFailed.error}`
        : input.pipelineFailed.agent,
    });
  }
  if (input.rateLimited) {
    alerts.push({
      kind: "platform_rate_limit",
      title: "Платформа ограничила частоту запросов",
      detail: input.rateLimitDetail ?? "HTTP 429 / rate limit",
    });
  }
  return alerts;
}
