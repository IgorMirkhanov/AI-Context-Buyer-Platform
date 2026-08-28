import { ConfigService } from '@nestjs/config';
import { PipelineJob } from '@context-buyer/agents';
import { PipelineQueue } from './pipeline.queue';

describe('PipelineQueue', () => {
  it('runs one job per project and does not collapse them into a global slot', async () => {
    const queue = new PipelineQueue({
      get: () => undefined,
    } as unknown as ConfigService);
    const seen: PipelineJob[] = [];
    await queue.start(async (job) => {
      seen.push({
        organizationId: job.organizationId!,
        projectId: job.projectId!,
      });
    });
    await queue.enqueue({ organizationId: 'org-a', projectId: 'p1' });
    await queue.enqueue({ organizationId: 'org-a', projectId: 'p2' });
    expect(seen).toEqual([
      { organizationId: 'org-a', projectId: 'p1' },
      { organizationId: 'org-a', projectId: 'p2' },
    ]);
    expect((await queue.getStatus('p1')).jobId).toBe('pipeline:p1');
    expect((await queue.getStatus('p2')).jobId).toBe('pipeline:p2');
    await queue.onModuleDestroy();
  });

  it('does not silently run inline when BullMQ is selected but Redis is down', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const queue = new PipelineQueue({
        get: (key: string) => {
          if (key === 'PIPELINE_QUEUE') return 'bullmq';
          if (key === 'REDIS_URL') return 'redis://127.0.0.1:1';
          return undefined;
        },
      } as unknown as ConfigService);
      let ran = false;
      await queue.start(async () => {
        ran = true;
      });
      await expect(
        queue.enqueue({ organizationId: 'org-a', projectId: 'p1' }),
      ).rejects.toThrow(/BullMQ is not connected/);
      expect(ran).toBe(false);
      expect(queue.mode).toBe('bullmq');
      await queue.onModuleDestroy();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('schedules background work through the same inline queue', async () => {
    const previous = process.env.NODE_ENV;
    const queue = new PipelineQueue({
      get: () => undefined,
    } as unknown as ConfigService);
    process.env.NODE_ENV = 'development';
    try {
      let calls = 0;
      queue.register('token_refresh', async () => {
        calls += 1;
      });
      await queue.start();
      await queue.schedule('token_refresh', 20);
      await new Promise((resolve) => setTimeout(resolve, 90));
      expect(calls).toBeGreaterThanOrEqual(2);
      await queue.onModuleDestroy();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
