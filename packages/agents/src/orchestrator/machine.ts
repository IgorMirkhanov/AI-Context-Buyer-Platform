/** Deterministic project pipeline. LLM never chooses the next step. */

export const PIPELINE_STAGES = [
  "idle",
  "brief_submitted",
  "analysis_in_progress",
  "analysis_ready",
  "semantic_in_progress",
  "semantic_ready",
  "plan_in_progress",
  "plan_ready",
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
  | "analysis"
  | "semantic"
  | "plan_preview"
  | "copywriting"
  | "campaign_builder";

export type PipelineRunningAgent = PipelineAgentStep | "validation";

export type PipelineFacts = {
  hasBrief: boolean;
  hasAnalysis: boolean;
  hasSemantic: boolean;
  hasPlan: boolean;
  planApproved: boolean;
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

export type PipelineFullRunAction = PipelineAgentStep | "approve_plan";

export type PipelineFullRunPlan = {
  stage: PipelineStage;
  action: PipelineFullRunAction | null;
  blockedReason: string | null;
  runnable: boolean;
};

const HUMAN_GATES: ReadonlySet<PipelineStage> = new Set([
  "analysis_ready",
  "plan_ready",
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
  const nextStep = nextAutoStep(stage, facts);
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
  if (facts.runningAgent === "analysis") return "analysis_in_progress";
  if (facts.runningAgent === "semantic") return "semantic_in_progress";
  if (facts.runningAgent === "plan_preview") return "plan_in_progress";
  if (facts.runningAgent === "copywriting") return "copywriting_in_progress";
  if (facts.runningAgent === "validation") return "validation_in_progress";
  if (facts.lastFailedAgent) return "failed";
  if (facts.hasLiveCampaign && facts.hasSnapshots) return "live_optimizing";
  if (facts.hasLiveCampaign) return "launched";
  if (facts.draftPendingApproval || facts.hasDraft) return "awaiting_approval";
  if (facts.hasCreatives) return "copy_ready";
  if (facts.hasPlan && !facts.planApproved) return "plan_ready";
  if (facts.hasSemantic) return "semantic_ready";
  if (facts.hasAnalysis) return "analysis_ready";
  if (facts.hasBrief) return "brief_submitted";
  return "idle";
}

function nextAutoStep(
  stage: PipelineStage,
  facts: PipelineFacts,
): PipelineAgentStep | null {
  switch (stage) {
    case "brief_submitted":
      return "analysis";
    case "semantic_ready":
      if (!facts.hasPlan) return "plan_preview";
      if (facts.planApproved) return "copywriting";
      return null;
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
  if (
    agent === "analysis" ||
    agent === "semantic" ||
    agent === "plan_preview" ||
    agent === "campaign_builder"
  ) {
    return agent;
  }
  return null;
}

/** Full «до черновика» run: skips per-tab gates, auto-approves plan, stops at draft. */
export function planFullRunToDraft(facts: PipelineFacts): PipelineFullRunPlan {
  const stage = deriveStage(facts);

  if (
    stage === "awaiting_approval" ||
    stage === "launched" ||
    stage === "live_optimizing"
  ) {
    return {
      stage,
      action: null,
      blockedReason: humanGateReason(stage),
      runnable: false,
    };
  }

  if (facts.runningAgent) {
    return {
      stage,
      action: null,
      blockedReason: "Шаг уже выполняется",
      runnable: false,
    };
  }

  if (stage === "failed") {
    const action = retryStep(facts.lastFailedAgent);
    return {
      stage,
      action,
      blockedReason:
        facts.lastError ?? "Последний шаг пайплайна завершился с ошибкой",
      runnable: action !== null,
    };
  }

  if (stage === "copy_ready" && facts.criticalIssues > 0) {
    return {
      stage,
      action: null,
      blockedReason:
        "Исправьте критические ошибки валидации до сборки черновика",
      runnable: false,
    };
  }

  if (stage === "analysis_ready") {
    return { stage, action: "semantic", blockedReason: null, runnable: true };
  }

  if (stage === "plan_ready") {
    return { stage, action: "approve_plan", blockedReason: null, runnable: true };
  }

  const manual = planPipeline(facts);
  return {
    stage: manual.stage,
    action: manual.nextStep,
    blockedReason: manual.blockedReason,
    runnable: manual.nextStep !== null,
  };
}

export function fullRunToDraftAvailable(facts: PipelineFacts): boolean {
  return planFullRunToDraft(facts).runnable;
}

function humanGateReason(stage: PipelineStage): string {
  if (stage === "analysis_ready") {
    return "Анализ готов. «Прогнать пайплайн до черновика» — автопрогон дальше, или вкладка «Анализ» для пошаговой работы.";
  }
  if (stage === "plan_ready") {
    return "План готов. «Прогнать пайплайн до черновика» продолжит автоматически, или вкладка «План» → «Ок, собирай».";
  }
  if (stage === "awaiting_approval") {
    return "Черновик готов. Проверьте на вкладке «Кампания» или отмените, чтобы доработать этапы и прогнать снова.";
  }
  return "Кампания уже в кабинете. Пайплайн сам её не перепубликует.";
}
