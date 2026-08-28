import {
  PIPELINE_QUEUE_ATTEMPTS,
  pipelineJobId,
  resolvePipelineQueueMode,
} from '@context-buyer/agents';

describe('pipeline queue identity', () => {
  it('keys jobs by project, not by a global queue slot', () => {
    expect(pipelineJobId('p1')).toBe('pipeline:p1');
    expect(pipelineJobId('p1')).not.toBe(pipelineJobId('p2'));
  });

  it('stays inline in tests even if Redis is configured', () => {
    expect(
      resolvePipelineQueueMode({
        nodeEnv: 'test',
        redisUrl: 'redis://localhost:6379',
        explicit: 'bullmq',
      }),
    ).toBe('inline');
  });

  it('uses bullmq only when Redis is available outside tests', () => {
    expect(
      resolvePipelineQueueMode({
        nodeEnv: 'development',
        redisUrl: 'redis://localhost:6379',
      }),
    ).toBe('bullmq');
    expect(resolvePipelineQueueMode({ nodeEnv: 'development' })).toBe('inline');
  });

  it('keeps a limited retry budget for the dead-letter path', () => {
    expect(PIPELINE_QUEUE_ATTEMPTS).toBeGreaterThan(1);
  });
});
