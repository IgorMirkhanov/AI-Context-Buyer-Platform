import { Logger } from '@nestjs/common';
import type { OpsAlertKind } from '@prisma/client';

const log = new Logger('AlertWebhook');

/** Critical kinds that page ops outside the product UI. */
export const CRITICAL_OPS_ALERT_KINDS: ReadonlySet<OpsAlertKind> = new Set([
  'platform_rate_limit',
  'oauth_expired',
  'pipeline_failed',
]);

export type AlertWebhookPayload = {
  projectId: string;
  kind: OpsAlertKind;
  title: string;
  detail: string | null;
};

/**
 * Fire-and-forget POST to ALERT_WEBHOOK_URL (Slack/Telegram-compatible JSON).
 * Missing URL or non-critical kind → no-op. Network errors never throw.
 */
export async function notifyAlertWebhook(
  webhookUrl: string | undefined,
  alert: AlertWebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const url = webhookUrl?.trim();
  if (!url) return false;
  if (!CRITICAL_OPS_ALERT_KINDS.has(alert.kind)) return false;

  const body = {
    text: `[ops_alert] ${alert.kind} · project ${alert.projectId}: ${alert.title}`,
    projectId: alert.projectId,
    kind: alert.kind,
    title: alert.title,
    detail: alert.detail,
  };

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      log.warn(`ALERT_WEBHOOK_URL responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    log.warn(
      err instanceof Error
        ? `ALERT_WEBHOOK_URL failed: ${err.message}`
        : 'ALERT_WEBHOOK_URL failed',
    );
    return false;
  }
}
