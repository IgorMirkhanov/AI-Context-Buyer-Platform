import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'net';
import {
  BackgroundJobKind,
  PIPELINE_QUEUE_ATTEMPTS,
  PIPELINE_QUEUE_NAME,
  PipelineJob,
  PipelineQueueMode,
  QueueJob,
  pipelineJobId,
  resolvePipelineQueueMode,
} from '@context-buyer/agents';

export type PipelineQueueStatus = {
  mode: PipelineQueueMode;
  jobId: string;
  status: 'idle' | 'queued' | 'active' | 'completed' | 'failed';
  failedReason: string | null;
};

type JobHandler = (job: QueueJob) => Promise<void>;

type MemoryRecord = {
  job: QueueJob;
  status: PipelineQueueStatus['status'];
  failedReason: string | null;
};

@Injectable()
export class PipelineQueue implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PipelineQueue.name);
  readonly mode: PipelineQueueMode;
  private readonly handlers = new Map<BackgroundJobKind, JobHandler>();
  private readonly memory = new Map<string, MemoryRecord>();
  private readonly timers = new Map<BackgroundJobKind, ReturnType<typeof setInterval>>();
  private queue?: import('bullmq').Queue;
  private worker?: import('bullmq').Worker;
  private readonly redisUrl?: string;
  private connected = false;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL')?.trim() || undefined;
    this.mode = resolvePipelineQueueMode({
      nodeEnv: process.env.NODE_ENV,
      redisUrl: this.redisUrl,
      explicit: config.get<string>('PIPELINE_QUEUE'),
    });
  }

  register(kind: BackgroundJobKind, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  async onModuleInit() {
    await this.start();
  }

  async start(handler?: JobHandler) {
    if (handler) {
      this.register('pipeline_run', handler);
    }
    if (this.connected) return;
    this.connected = true;
    if (this.mode !== 'bullmq') return;
    if (!this.redisUrl) {
      this.log.error(
        'PIPELINE_QUEUE=bullmq but REDIS_URL is empty; jobs will not run inline',
      );
      return;
    }
    const redisUp = await waitForRedis(this.redisUrl);
    if (!redisUp) {
      this.log.error(
        'Redis is not reachable; BullMQ worker not started. Set PIPELINE_QUEUE=inline to run without Redis.',
      );
      return;
    }
    const { Queue, Worker } = await import('bullmq');
    const connection = redisConnection(this.redisUrl);
    try {
      this.queue = new Queue(PIPELINE_QUEUE_NAME, { connection });
      this.worker = new Worker(
        PIPELINE_QUEUE_NAME,
        async (job) => {
          const data = (job.data ?? {}) as QueueJob;
          const kind = data.kind ?? 'pipeline_run';
          if (kind === 'pipeline_run') {
            if (!data.organizationId || !data.projectId) {
              throw new Error('Pipeline job is missing organizationId/projectId');
            }
            if (job.id && job.id !== pipelineJobId(data.projectId)) {
              throw new Error('Pipeline job id does not match project');
            }
          }
          await this.dispatch(kind, data);
        },
        { connection, concurrency: 2 },
      );
      this.worker.on('failed', (job, err) => {
        this.log.warn(
          `queue job ${job?.id ?? '?'} failed: ${err.message}`,
        );
      });
      this.worker.on('error', (err) => {
        this.log.warn(err.message);
      });
    } catch (err) {
      await this.worker?.close().catch(() => undefined);
      await this.queue?.close().catch(() => undefined);
      this.queue = undefined;
      this.worker = undefined;
      this.log.error(
        err instanceof Error
          ? err.message
          : 'Failed to start BullMQ; jobs will not run inline',
      );
    }
  }

  async enqueue(job: PipelineJob): Promise<{ jobId: string; queued: boolean }> {
    const payload: QueueJob = {
      kind: 'pipeline_run',
      organizationId: job.organizationId,
      projectId: job.projectId,
    };
    const jobId = pipelineJobId(job.projectId);
    if (this.mode === 'inline') {
      await this.runInline(jobId, payload);
      return { jobId, queued: false };
    }
    if (!this.queue) {
      throw new Error(
        'BullMQ is not connected; start Redis or set PIPELINE_QUEUE=inline',
      );
    }
    try {
      await this.queue.add('pipeline_run', payload, {
        jobId,
        attempts: PIPELINE_QUEUE_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      });
    } catch (err) {
      if (!isDuplicateJob(err)) throw err;
    }
    return { jobId, queued: true };
  }

  async enqueueBackground(
    job: QueueJob,
  ): Promise<{ jobId: string; queued: boolean }> {
    const kind = job.kind ?? 'pipeline_run';
    if (kind === 'pipeline_run') {
      if (!job.organizationId || !job.projectId) {
        throw new Error('Pipeline job is missing organizationId/projectId');
      }
      return this.enqueue({
        organizationId: job.organizationId,
        projectId: job.projectId,
      });
    }
    const jobId = `${kind}:${job.projectId ?? 'global'}:${Date.now()}`;
    if (this.mode === 'inline') {
      await this.dispatch(kind, job);
      return { jobId, queued: false };
    }
    if (!this.queue) {
      throw new Error(
        'BullMQ is not connected; start Redis or set PIPELINE_QUEUE=inline',
      );
    }
    await this.queue.add(kind, job, {
      jobId,
      attempts: PIPELINE_QUEUE_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    });
    return { jobId, queued: true };
  }

  async cancel(projectId: string): Promise<boolean> {
    const jobId = pipelineJobId(projectId);
    if (this.mode === 'inline' || !this.queue) {
      const row = this.memory.get(jobId);
      if (!row || row.status === 'idle' || row.status === 'completed') {
        return false;
      }
      this.memory.set(jobId, {
        job: row.job,
        status: 'idle',
        failedReason: null,
      });
      return true;
    }
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = String(await job.getState());
    if (
      state === 'waiting' ||
      state === 'delayed' ||
      state === 'paused' ||
      state === 'prioritized' ||
      state === 'waiting-children'
    ) {
      await job.remove();
      return true;
    }
    if (state === 'active') {
      try {
        await job.moveToFailed(new Error('Отменено пользователем'), '0');
      } catch {
        await job.remove();
      }
      return true;
    }
    if (state === 'failed') {
      await job.remove();
      return true;
    }
    return false;
  }

  async schedule(kind: BackgroundJobKind, everyMs: number) {
    if (kind === 'pipeline_run') {
      throw new Error('pipeline_run is enqueued per project, not on a timer');
    }
    if (process.env.NODE_ENV === 'test') return;
    if (!everyMs || everyMs < 0) return;
    if (this.mode === 'inline') {
      const existing = this.timers.get(kind);
      if (existing) clearInterval(existing);
      this.timers.set(
        kind,
        setInterval(() => {
          this.dispatch(kind, { kind }).catch((err: unknown) =>
            this.log.warn(
              err instanceof Error ? err.message : `${kind} job failed`,
            ),
          );
        }, everyMs),
      );
      return;
    }
    if (!this.queue) {
      this.log.error(
        `BullMQ is not connected; ${kind} is not scheduled. Set PIPELINE_QUEUE=inline to run without Redis.`,
      );
      return;
    }
    await this.queue.upsertJobScheduler(
      kind,
      { every: everyMs },
      { name: kind, data: { kind } },
    );
  }

  async getStatus(projectId: string): Promise<PipelineQueueStatus> {
    const jobId = pipelineJobId(projectId);
    if (this.mode === 'inline' || !this.queue) {
      const row = this.memory.get(jobId);
      return {
        mode: this.mode,
        jobId,
        status: row?.status ?? 'idle',
        failedReason: row?.failedReason ?? null,
      };
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { mode: this.mode, jobId, status: 'idle', failedReason: null };
    }
    const state = String(await job.getState());
    const status = mapJobState(state);
    return {
      mode: this.mode,
      jobId,
      status,
      failedReason: job.failedReason || null,
    };
  }

  async onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    await this.worker?.close();
    await this.queue?.close();
  }

  private async dispatch(kind: BackgroundJobKind, job: QueueJob) {
    const handler = this.handlers.get(kind);
    if (!handler) {
      throw new Error(`No handler registered for ${kind}`);
    }
    await handler({ ...job, kind });
  }

  private async runInline(jobId: string, job: QueueJob) {
    this.memory.set(jobId, {
      job,
      status: 'active',
      failedReason: null,
    });
    try {
      await this.dispatch(job.kind, job);
      this.memory.set(jobId, {
        job,
        status: 'completed',
        failedReason: null,
      });
    } catch (err) {
      const failedReason =
        err instanceof Error ? err.message : 'pipeline job failed';
      this.memory.set(jobId, { job, status: 'failed', failedReason });
      throw err;
    }
  }
}

function redisConnection(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 1500,
  };
}

async function waitForRedis(redisUrl: string, attempts = 5): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await redisReady(redisUrl)) return true;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return false;
}

async function redisReady(redisUrl: string): Promise<boolean> {
  const parsed = new URL(redisUrl);
  const port = Number(parsed.port || 6379);
  const host = parsed.hostname;
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1500);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

function mapJobState(state: string): PipelineQueueStatus['status'] {
  if (
    state === 'waiting' ||
    state === 'delayed' ||
    state === 'paused' ||
    state === 'prioritized' ||
    state === 'waiting-children'
  ) {
    return 'queued';
  }
  if (state === 'active') return 'active';
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  return 'idle';
}

function isDuplicateJob(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already exists|JobIdAlreadyExists/i.test(message);
}
