export const PIPELINE_QUEUE_NAME = "pipeline";
export const PIPELINE_QUEUE_ATTEMPTS = 3;

export type PipelineQueueMode = "inline" | "bullmq";

export type BackgroundJobKind =
  | "pipeline_run"
  | "token_refresh"
  | "performance_collect"
  | "autopilot"
  | "ops_alerts"
  | "optimization_scan"
  | "optimization_run"
  | "campaign_sync_scan"
  | "campaign_sync_run";

export type PipelineJob = {
  organizationId: string;
  projectId: string;
};

export type QueueJob = {
  kind: BackgroundJobKind;
  organizationId?: string;
  projectId?: string;
};

export function pipelineJobId(projectId: string): string {
  return `pipeline:${projectId}`;
}

export function resolvePipelineQueueMode(input: {
  nodeEnv?: string;
  redisUrl?: string;
  explicit?: string;
}): PipelineQueueMode {
  const explicit = input.explicit?.trim().toLowerCase();
  if (explicit === "inline" || input.nodeEnv === "test") {
    return "inline";
  }
  if (explicit === "bullmq") {
    return "bullmq";
  }
  return input.redisUrl?.trim() ? "bullmq" : "inline";
}

