import Redis from 'ioredis';

/** Fast Redis PING; returns false on missing URL, timeout, or error. */
export async function pingRedis(
  redisUrl: string | undefined,
  timeoutMs = 1500,
): Promise<boolean> {
  const url = redisUrl?.trim();
  if (!url) return false;

  let client: Redis | undefined;
  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: timeoutMs,
      lazyConnect: true,
    });
    const result = await Promise.race([
      (async () => {
        await client!.connect();
        return client!.ping();
      })(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs),
      ),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  } finally {
    if (client) {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
