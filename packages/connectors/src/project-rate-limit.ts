import { isPlatformRateLimitError } from "./types";

export const DEFAULT_PROJECT_API_MIN_INTERVAL_MS = 200;
export const DEFAULT_PROJECT_API_MAX_BACKOFF_MS = 4000;

type QueueSlot = {
  chain: Promise<void>;
  lastAt: number;
  backoffMs: number;
};

export class ProjectApiLimiter {
  private readonly slots = new Map<string, QueueSlot>();

  constructor(
    private readonly minIntervalMs = DEFAULT_PROJECT_API_MIN_INTERVAL_MS,
    private readonly maxBackoffMs = DEFAULT_PROJECT_API_MAX_BACKOFF_MS,
  ) {}

  async schedule<T>(
    projectId: string,
    platform: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!projectId) {
      throw new Error("projectId is required");
    }
    const key = `${platform}:${projectId}`;
    const slot = this.slots.get(key) ?? {
      chain: Promise.resolve(),
      lastAt: 0,
      backoffMs: 0,
    };
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = slot.chain;
    slot.chain = previous.then(() => next);
    this.slots.set(key, slot);
    await previous.catch(() => undefined);
    const interval = Math.max(this.minIntervalMs, slot.backoffMs);
    const wait = interval - (Date.now() - slot.lastAt);
    if (wait > 0) {
      await sleep(wait);
    }
    try {
      const value = await fn();
      if (isHttpRateLimited(value)) {
        this.bumpBackoff(slot);
      } else {
        slot.backoffMs = 0;
      }
      return value;
    } catch (error) {
      if (isPlatformRateLimitError(error)) {
        this.bumpBackoff(slot);
      }
      throw error;
    } finally {
      slot.lastAt = Date.now();
      release();
    }
  }

  private bumpBackoff(slot: QueueSlot): void {
    const doubled =
      slot.backoffMs === 0 ? this.minIntervalMs * 2 : slot.backoffMs * 2;
    slot.backoffMs = Math.min(this.maxBackoffMs, doubled);
  }
}

export const defaultProjectApiLimiter = new ProjectApiLimiter();

function isHttpRateLimited(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status: unknown }).status === 429
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
