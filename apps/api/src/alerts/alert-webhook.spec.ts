import {
  CRITICAL_OPS_ALERT_KINDS,
  notifyAlertWebhook,
} from './alert-webhook';

describe('notifyAlertWebhook', () => {
  const alert = {
    projectId: 'p1',
    kind: 'pipeline_failed' as const,
    title: 'Пайплайн остановился с ошибкой',
    detail: 'semantic: timeout',
  };

  it('sends one HTTP POST when ALERT_WEBHOOK_URL is set for a critical alert', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const sent = await notifyAlertWebhook(
      'https://hooks.example/alerts',
      alert,
      fetchImpl as unknown as typeof fetch,
    );
    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hooks.example/alerts',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.kind).toBe('pipeline_failed');
    expect(body.projectId).toBe('p1');
  });

  it('does nothing when ALERT_WEBHOOK_URL is empty', async () => {
    const fetchImpl = jest.fn();
    const sent = await notifyAlertWebhook(undefined, alert, fetchImpl as never);
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips non-critical kinds (oauth_expiring)', async () => {
    const fetchImpl = jest.fn();
    const sent = await notifyAlertWebhook(
      'https://hooks.example/alerts',
      { ...alert, kind: 'oauth_expiring' },
      fetchImpl as never,
    );
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(CRITICAL_OPS_ALERT_KINDS.has('oauth_expiring')).toBe(false);
  });

  it('swallows fetch errors', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network'));
    await expect(
      notifyAlertWebhook('https://hooks.example/alerts', alert, fetchImpl as never),
    ).resolves.toBe(false);
  });
});
