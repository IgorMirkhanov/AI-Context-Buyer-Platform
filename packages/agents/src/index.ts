export type AgentType =
  | "semantic"
  | "copywriting"
  | "validation"
  | "campaign_builder"
  | "reporting"
  | "optimization"
  | "media";

export type AgentTaskStatus = "pending" | "running" | "done" | "failed";

export {
  runSemanticPipeline,
  extractMasksStep,
  expandKeywordsStep,
  labelIntentStep,
  generateNegativesStep,
  clusterStep,
  finalizeStep,
} from "./semantic/pipeline";
export type { SemanticPipelineDeps, KeywordIdeasFn } from "./semantic/pipeline";
export { validateSemanticCore, SemanticCoreValidationError } from "./semantic/validate";
export { SEMANTIC_CORE_JSON_SCHEMA } from "./semantic/schema";
export { HeuristicSemanticLlm } from "./semantic/llm";
export type { SemanticLlm } from "./semantic/llm";
export {
  HashNgramEmbeddings,
  InMemoryVectorIndex,
  clusterByCosine,
  cosine,
} from "./semantic/embeddings";
export type { EmbeddingsClient, VectorIndex } from "./semantic/embeddings";
export { intentFromHeuristics, masksFromBrief } from "./semantic/heuristics";
export {
  compareSemanticQa,
  matchesIrrelevant,
  normalizePhrase,
  round4,
  scoreClusterSeparation,
} from "./semantic/qa-compare";
export type {
  IrrelevantRule,
  PhraseSource,
  SemanticQaAgentOutput,
  SemanticQaFixture,
  SemanticQaMetrics,
} from "./semantic/qa-compare";
export type {
  ClusterCategory,
  KeywordIdea,
  KeywordIntent,
  LlmUsage,
  SemanticBriefInput,
  SemanticCluster,
  SemanticCore,
  SemanticKeyword,
} from "./semantic/types";

export { HeuristicCopywriter, sanitizeClusterCreatives } from "./copywriting/generate";
export type { Copywriter } from "./copywriting/generate";
export {
  clipToLimit,
  containsForbidden,
  limitOf,
  normalize,
  sanitizeForbidden,
} from "./copywriting/limits";
export type {
  AdVariant,
  ClusterCreatives,
  CopyMarketing,
  CreativeElementType,
  PlatformLimit,
} from "./copywriting/limits";
export { AD_CREATIVES_JSON_SCHEMA } from "./copywriting/schema";
export {
  validateAdCreatives,
  AdCreativesValidationError,
} from "./copywriting/validate";
export { runCopyAndValidate, runCopywriting } from "./copywriting/pipeline";
export { validateCreatives } from "./validation/validate";
export type {
  ValidationIssueDraft,
  ValidationResult,
} from "./validation/validate";

export { buildCampaignDraft } from "./campaign-builder/build";
export { CAMPAIGN_DRAFT_JSON_SCHEMA } from "./campaign-builder/schema";
export {
  validateCampaignDraft,
  CampaignDraftValidationError,
} from "./campaign-builder/validate";
export type {
  CampaignAd,
  CampaignAdGroup,
  CampaignBuilderInput,
  CampaignDraftStructure,
  PublishCheckpoint,
} from "./campaign-builder/types";

export { buildPerformanceReport } from "./reporting/build";
export {
  aggregateMetrics,
  compareToTarget,
  insightFacts,
  round2,
} from "./reporting/metrics";
export {
  buildAnalyticsView,
  buildAttributedLeadsSeries,
  buildDailySeries,
  forecastPacing,
  isObservedDay,
  toChartPoint,
} from "./reporting/analytics";
export {
  addUtcDays,
  defaultReportPeriod,
  enumerateUtcDates,
  inclusiveDayCount,
  periodEndingOn,
} from "./reporting/period";
export { HeuristicReportingLlm } from "./reporting/llm";
export { PERFORMANCE_REPORT_JSON_SCHEMA } from "./reporting/schema";
export {
  validatePerformanceReport,
  PerformanceReportValidationError,
} from "./reporting/validate";
export type {
  AnalyticsAdGroupSlice,
  AnalyticsCampaignMeta,
  AnalyticsCampaignSlice,
  AnalyticsSnapshotRow,
  AnalyticsView,
  ChartPoint,
  DailyMetrics,
  GoalComparison,
  InsightWriter,
  MetricsSummary,
  PacingForecast,
  PerformanceReport,
} from "./reporting/types";

export { evaluateOpsAlerts, OAUTH_EXPIRING_WITHIN_MS } from "./ops/alerts";
export type { OpsAlertDraft, OpsAlertInput, OpsAlertKind } from "./ops/alerts";

export { planPipeline, deriveStage, PIPELINE_STAGES } from "./orchestrator/machine";
export type {
  PipelineAgentStep,
  PipelineFacts,
  PipelinePlan,
  PipelineRunningAgent,
  PipelineStage,
} from "./orchestrator/machine";
export {
  PIPELINE_QUEUE_ATTEMPTS,
  PIPELINE_QUEUE_NAME,
  pipelineJobId,
  resolvePipelineQueueMode,
} from "./orchestrator/queue";
export type {
  BackgroundJobKind,
  PipelineJob,
  PipelineQueueMode,
  QueueJob,
} from "./orchestrator/queue";

export { buildOptimizationPlan } from "./optimization/build";
export { HeuristicOptimizationLlm } from "./optimization/llm";
export {
  isWastedTerm,
  proposeRecommendations,
  shouldCutBudget,
  shouldPause,
} from "./optimization/rules";
export { OPTIMIZATION_THRESHOLDS } from "./optimization/types";
export {
  AUTOPILOT_GATES,
  evaluateAutopilotEligibility,
  summarizeAutopilotStats,
} from "./optimization/autopilot";
export type {
  AutopilotEligibility,
  AutopilotStats,
} from "./optimization/autopilot";
export { OPTIMIZATION_PLAN_JSON_SCHEMA } from "./optimization/schema";
export {
  assertRationaleKeepsFigures,
  validateOptimizationPlan,
  OptimizationPlanValidationError,
} from "./optimization/validate";
export type {
  CampaignPerfInput,
  OptimizationAction,
  OptimizationInput,
  OptimizationPlan,
  OptimizationRecommendation,
  OptimizationWriter,
  SearchTermInput,
} from "./optimization/types";

export { wrapAttributionSummary } from "./attribution/build";
export { agentAcceptance, clusterEditAcceptance } from "./ops/quality";
export {
  attributedCpl,
  attributionFacts,
  buildAttributionSummary,
} from "./attribution/summary";
export { ATTRIBUTION_SUMMARY_JSON_SCHEMA } from "./attribution/schema";
export {
  validateAttributionSummary,
  AttributionSummaryValidationError,
} from "./attribution/validate";
export type { AttributionSummary } from "./attribution/summary";

export {
  estimateLlmCostUsd,
  resolveLlmCostUsd,
  summarizeLlmUsage,
  previewLlmText,
  roundUsd,
} from "./llm/cost";
export type { LlmUsageRow, LlmUsageSummary } from "./llm/cost";
export {
  AI_PROVIDER_REQUIRED_MESSAGE,
  envKeyName,
  maskApiKey,
  readEnvAiKey,
  redactAiSecret,
  resolveAiApiKey,
} from "./llm/credentials";
export type {
  AiCredentialSource,
  AiCredentialStatus,
  AiProviderName,
  ResolvedAiKey,
} from "./llm/credentials";

export { buildMediaPlan } from "./media/build";
export { HeuristicMediaPromptWriter, sanitizeMediaPrompt } from "./media/prompts";
export { MEDIA_PLAN_JSON_SCHEMA } from "./media/schema";
export {
  validateMediaPlan,
  MediaPlanValidationError,
} from "./media/validate";
export type {
  MediaClusterInput,
  MediaKind,
  MediaMarketing,
  MediaPlan,
  MediaPlanInput,
  MediaPlanItem,
  MediaPromptWriter,
} from "./media/types";
