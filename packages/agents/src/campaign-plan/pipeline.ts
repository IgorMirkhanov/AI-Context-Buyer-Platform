import type { LlmUsage } from "../semantic/types";
import type {
  CampaignPlan,
  CampaignPlanBriefInput,
  CampaignPlanClusterInput,
  CampaignPlanWriter,
} from "./types";

export type CampaignPlanPipelineDeps = {
  writer: CampaignPlanWriter;
  onLlmCall?: (usage: LlmUsage) => Promise<void> | void;
};

export async function runCampaignPlanPipeline(
  brief: CampaignPlanBriefInput,
  clusters: CampaignPlanClusterInput[],
  deps: CampaignPlanPipelineDeps,
): Promise<CampaignPlan> {
  const { plan, usage } = await deps.writer.plan(brief, clusters);
  await deps.onLlmCall?.(usage);
  return plan;
}
