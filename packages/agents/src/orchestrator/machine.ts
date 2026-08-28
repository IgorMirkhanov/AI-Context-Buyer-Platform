/** Deterministic project pipeline. LLM never chooses the next step. */

export const PIPELINE_STAGES = [
  "idle",
  "brief_submitted",
  "semantic_in_progress",
  "semantic_ready",
  "copywriting_in_progress",
  "copy_ready",
  "validation_in_progress",
  "draft_ready",
  "awaiting_approval",
  "launched",
  "live_optimizing",
  "failed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineAgentStep =
  | "semantic"
  | "copywriting"
  | "campaign_builder";

export type PipelineRunningAgent = PipelineAgentStep | "validation";

export type PipelineFacts = {
  hasBrief: boolean;
  hasSemantic: boolean;
  hasCreatives: boolean;
  criticalIssues: number;
  hasDraft: boolean;
  draftPendingApproval: boolean;
  hasLiveCampaign: boolean;
  hasSnapshots: boolean;
  runningAgent: PipelineRunningAgent | null;
  lastFailedAgent: PipelineRunningAgent | null;
  lastError: string | null;
};

export type PipelinePlan = {
  stage: PipelineStage;
  nextStep: PipelineAgentStep | null;
  blockedReason: string | null;
  autoRunnable: boolean;
};

const HUMAN_GATES: ReadonlySet<PipelineStage> = new Set([
  "awaiting_approval",
  "launched",
  "live_optimizing",
]);

export function planPipeline(facts: PipelineFacts): PipelinePlan {
  const stage = deriveStage(facts);
  if (stage === "failed") {
    const nextStep = retryStep(facts.lastFailedAgent);
    return {
      stage,
      nextStep,
      blockedReason: facts.lastError ?? "Последний шаг пайплайна завершился с ошибкой",
      autoRunnable: nextStep !== null,
    };
  }
  if (HUMAN_GATES.has(stage)) {
    return {
      stage,
      nextStep: null,
      blockedReason: humanGateReason(stage),
      autoRunnable: false,
    };
  }
  if (facts.runningAgent) {
    return {
      stage,
      nextStep: null,
      blockedReason: "Шаг уже выполняется",
      autoRunnable: false,
    };
  }
  if (stage === "copy_ready" && facts.criticalIssues > 0) {
    return {
      stage,
      nextStep: null,
      blockedReason:
        "Исправьте критические ошибки валидации до сборки черновика",
      autoRunnable: false,
    };
  }
  const nextStep = nextAutoStep(stage);
  return {
    stage,
    nextStep,
    blockedReason:
      nextStep === null && stage === "idle"
        ? "Заполните бриф проекта"
        : null,
    autoRunnable: nextStep !== null,
  };
}

export function deriveStage(facts: PipelineFacts): PipelineStage {
  if (facts.runningAgent === "semantic") return "semantic_in_progress";
  if (facts.runningAgent === "copywriting") return "copywriting_in_progress";
  if (facts.runningAgent === "validation") return "validation_in_progress";
  if (facts.lastFailedAgent) return "failed";
  if (facts.hasLiveCampaign && facts.hasSnapshots) return "live_optimizing";
  if (facts.hasLiveCampaign) return "launched";
  if (facts.draftPendingApproval || facts.hasDraft) return "awaiting_approval";
  if (facts.hasCreatives) return "copy_ready";
  if (facts.hasSemantic) return "semantic_ready";
  if (facts.hasBrief) return "brief_submitted";
  return "idle";
}

function nextAutoStep(stage: PipelineStage): PipelineAgentStep | null {
  switch (stage) {
    case "brief_submitted":
      return "semantic";
    case "semantic_ready":
      return "copywriting";
    case "copy_ready":
      return "campaign_builder";
    default:
      return null;
  }
}

function retryStep(
  agent: PipelineRunningAgent | null,
): PipelineAgentStep | null {
  if (agent === "validation" || agent === "copywriting") return "copywriting";
  if (agent === "semantic" || agent === "campaign_builder") return agent;
  return null;
}

function humanGateReason(stage: PipelineStage): string {
  if (stage === "awaiting_approval") {
    return "Черновик готов. Запуск кампании только после вашего подтверждения в UI.";
  }
  return "Кампания уже в кабинете. Пайплайн сам её не перепубликует.";
}
