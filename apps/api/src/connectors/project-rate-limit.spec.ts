import {
  PlatformApiError,
  ProjectApiLimiter,
} from '@context-buyer/connectors';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ProjectApiLimiter', () => {
  it('rejects an empty projectId', async () => {
    const limiter = new ProjectApiLimiter(10);
    await expect(
      limiter.schedule('', 'yandex_direct', async () => 1),
    ).rejects.toThrow(/projectId/);
  });

  it('serializes calls for the same project and platform', async () => {
    const limiter = new ProjectApiLimiter(20);
    const order: string[] = [];
    const first = limiter.schedule('project-a', 'yandex_direct', async () => {
      order.push('a-start');
      await delay(30);
      order.push('a-end');
      return 1;
    });
    const second = limiter.schedule('project-a', 'yandex_direct', async () => {
      order.push('b-start');
      order.push('b-end');
      return 2;
    });
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('lets sibling projects overlap', async () => {
    const limiter = new ProjectApiLimiter(50);
    let inFlight = 0;
    let peak = 0;
    const work = (projectId: string) =>
      limiter.schedule(projectId, 'yandex_direct', async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(40);
        inFlight -= 1;
      });
    await Promise.all([work('project-a'), work('project-b')]);
    expect(peak).toBe(2);
  });

  it('keeps platforms independent for one project', async () => {
    const limiter = new ProjectApiLimiter(50);
    let inFlight = 0;
    let peak = 0;
    const work = (platform: string) =>
      limiter.schedule('project-a', platform, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(40);
        inFlight -= 1;
      });
    await Promise.all([work('yandex_direct'), work('google_ads')]);
    expect(peak).toBe(2);
  });

  it('doubles the wait after consecutive 429 responses up to the cap', async () => {
    const limiter = new ProjectApiLimiter(15, 60);
    const times: number[] = [];
    const hit429 = async () => {
      times.push(Date.now());
      return { status: 429 };
    };
    await limiter.schedule('project-a', 'yandex_direct', hit429);
    await limiter.schedule('project-a', 'yandex_direct', hit429);
    await limiter.schedule('project-a', 'yandex_direct', hit429);
    const firstGap = times[1]! - times[0]!;
    const secondGap = times[2]! - times[1]!;
    expect(firstGap).toBeGreaterThanOrEqual(20);
    expect(secondGap).toBeGreaterThan(firstGap);
    expect(secondGap).toBeGreaterThanOrEqual(45);
  });

  it('resets backoff after a successful call', async () => {
    const limiter = new ProjectApiLimiter(15, 120);
    await limiter.schedule('project-a', 'yandex_direct', async () => ({
      status: 429,
    }));
    await limiter.schedule('project-a', 'yandex_direct', async () => ({
      status: 200,
    }));
    const started = Date.now();
    await limiter.schedule('project-a', 'yandex_direct', async () => 1);
    expect(Date.now() - started).toBeLessThan(80);
  });

  it('backs off when the call throws a 429 error', async () => {
    const limiter = new ProjectApiLimiter(15, 120);
    const err = new PlatformApiError(
      'HTTP 429',
      'campaigns.add',
      'too many requests',
      true,
    );
    await expect(
      limiter.schedule('project-a', 'yandex_direct', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    const started = Date.now();
    await limiter.schedule('project-a', 'yandex_direct', async () => 1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
  });
});
