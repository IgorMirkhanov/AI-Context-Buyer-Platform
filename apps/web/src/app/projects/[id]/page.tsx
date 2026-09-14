"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, API_URL, clearToken, downloadAuthenticated, getToken } from "@/lib/api";
import { errorMessage, localizeApiError } from "@/lib/api-errors";
import { DEFAULT_BRANDING, OrgBranding } from "@/lib/branding";
import { AiProviderNeeded } from "@/components/ai-provider-needed";
import { AppShell } from "@/shell/app-shell";
import { parseProjectTab } from "@/shell/project-tabs";
import { Alert } from "@/ui/alert";
import { Badge, StatusBadge } from "@/ui/badge";
import { btnClass, Button } from "@/ui/button";
import { Card, CardHint, CardTitle } from "@/ui/card";
import { BarChart, DonutChart } from "@/ui/charts";
import { KpiCard, KpiGrid } from "@/ui/kpi";
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from "@/ui/states";
import { AnalyticsPanel, type AttributionResult, type ReportResult } from "@/components/analytics-panel";
import { CreativesPanel } from "@/components/creatives-panel";
import { BriefEditor } from "@/components/brief-editor";
import { PipelineProgress } from "@/components/pipeline-progress";
import { PlanReviewPanel } from "@/components/plan-review-panel";
import { OptimizationScheduleBanner } from "@/components/optimization-schedule-banner";
import { ProjectContextPanel } from "@/components/project-context-panel";
import { formatDateRu } from "@/lib/format-datetime";
import {
  buildCampaignRefs,
  resolveAnalyzedWebsiteUrl,
} from "@/lib/project-campaign-refs";
import { cabinetCampaignUrl } from "@/lib/ad-platform-links";
import { TermHint, BeginnerNote } from "@/ui/term-hint";

type Brief = {
  project: {
    website_url: string;
    geo: string[];
    budget: { daily: number; currency: string };
    target_cpl?: number;
  };
  marketing: {
    usp: string[];
    target_audience: Array<{ segment: string }>;
  };
  exclusions: { global_negative_keywords: string[] };
};

type AnalysisResult = {
  task: { status: string; error: string | null } | null;
  ready: boolean;
  explanation: string | null;
  landingText: string | null;
  websiteUrl: string | null;
  customSeeds: string[];
  llmMode: string | null;
};

type SemanticResult = {
  task: { status: string; error: string | null } | null;
  negativeSuggestions: Array<{
    id: string;
    phrase: string;
    reason: string;
    source?: string;
    status: "pending" | "accepted" | "rejected";
  }>;
  clusters: Array<{
    id: string;
    name: string;
    category: string;
    keywords: Array<{
      phrase: string;
      intent: string;
      frequency: number;
      source: string;
      isCommercial?: boolean;
    }>;
    negativeKeywords: string[];
  }>;
};

type CreativesResult = {
  task: { status: string; error: string | null } | null;
  validationTask: { status: string; error: string | null } | null;
  quality?: {
    creatives: { total: number; edited: number; acceptedShare: number | null };
    clusters: { total: number; edited: number; acceptedShare: number | null };
  };
  creatives: Array<{
    id: string;
    clusterName: string;
    type: string;
    text: string;
    abGroup: string;
    status: string;
    issues: Array<{
      id: string;
      level: "critical" | "warning";
      code: string;
      message: string;
      autoFixed: boolean;
    }>;
  }>;
  issues: Array<{
    id: string;
    creativeId: string | null;
    level: "critical" | "warning";
    code: string;
    message: string;
    autoFixed: boolean;
  }>;
};

function platformTitle(platform: string): string {
  return platform === "google_ads" ? "Google Ads" : "Яндекс Директ";
}

type CampaignPlanResult = {
  task: { status: string; error: string | null } | null;
  ready: boolean;
  approved: boolean;
  campaignCount: number;
  llmMode: string | null;
  plan: {
    campaigns: Array<{
      name: string;
      rationale: string;
      ad_groups: Array<{
        name: string;
        cluster_names: string[];
      }>;
    }>;
  } | null;
};

type CampaignsResult = {
  task: { status: string; error: string | null } | null;
  draft: {
    id: string;
    status: string;
    structureJson: {
      campaigns: Array<{
        campaign: {
          name: string;
          budget_daily: number;
          currency: string;
          geo: string[];
          href: string;
          initial_status: string;
        };
        ad_groups: Array<{
          name: string;
          keywords: string[];
          negative_keywords: string[];
          ads: Array<{
            ab_group: string;
            headline1: string;
            headline2: string;
            description: string;
          }>;
        }>;
        publish?: { step?: string; error?: string; externalCampaignId?: string };
      }>;
      global_negatives: string[];
    };
  } | null;
  campaigns: Array<{
    id: string;
    externalCampaignId: string;
    status: string;
    source?: "platform" | "external";
    name?: string | null;
    draftUnitIndex?: number | null;
    budget: string | number | null;
  }>;
};

type OptimizationResult = {
  task: { status: string; error: string | null } | null;
  autopilot: boolean;
  optimizationLaunchedAt?: string | null;
  optimizationLastRunAt?: string | null;
  optimizationNextRunAt?: string | null;
  eligibility?: {
    eligible: boolean;
    reasons: string[];
    stats: {
      applied: number;
      rejected: number;
      reviewed: number;
      acceptRate: number | null;
    };
  };
  recommendations: Array<{
    id: string;
    type: string;
    status: string;
    rationale: string;
    evidence?: Record<string, unknown> | null;
    error: string | null;
    appliedBy?: string | null;
    campaignExternalId: string;
  }>;
};

type MediaResult = {
  task: { status: string; error: string | null } | null;
  publishedToAds: boolean;
  assets: Array<{
    id: string;
    kind: "image" | "video";
    status: string;
    provider: string;
    prompt: string;
    mimeType: string;
    width: number;
    height: number;
    durationMs: number | null;
    clusterId: string | null;
    clusterName: string | null;
    createdAt: string;
  }>;
};

type ProjectDetails = {
  id: string;
  name: string;
  status: string;
  primaryPlatform: string;
  websiteUrl: string | null;
  brief: Brief | null;
  connection: {
    status: "connected" | "not_connected" | "needs_reconnect";
    platform: string;
    externalAccountId: string | null;
    expiresAt: string | null;
    verificationError: string | null;
  };
};

type OpsAlertsResult = {
  alerts: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string | null;
  }>;
};

type AuditResult = {
  items: Array<{
    id: string;
    actor: string;
    action: string;
    platform: string;
    status: string;
    summary: Record<string, unknown> | null;
    error: string | null;
    createdAt: string;
    actorEmail: string | null;
  }>;
};

const AUDIT_ACTION: Record<string, string> = {
  create_campaign: "Создание кампании",
  create_ad_groups: "Группы объявлений",
  create_ads: "Объявления",
  add_keywords: "Ключевые слова",
  add_negative_keywords: "Минус-слова",
  set_budget: "Бюджет",
  pause_campaign: "Пауза кампании",
};

const AUDIT_ACTOR: Record<string, string> = {
  user: "пользователь",
  autopilot: "автопилот",
  system: "система",
};

type LlmUsageResult = {
  summary: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    byAgent: Array<{
      agentType: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
  };
  recent: Array<{
    id: string;
    agentType: string;
    step: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    createdAt: string;
    promptPreview: string;
  }>;
};

const LLM_AGENT: Record<string, string> = {
  analysis: "Анализ",
  semantic: "Семантика",
  campaign_plan: "План кампаний",
  copywriting: "Объявления",
  validation: "Валидация",
  campaign_builder: "Черновик",
  reporting: "Отчёты",
  optimization: "Оптимизация",
  media: "Креативы",
};

type PipelineResult = {
  projectId: string;
  stage: string;
  nextStep: string | null;
  blockedReason: string | null;
  autoRunnable: boolean;
  fullRunAvailable: boolean;
  canCancel?: boolean;
  queue?: {
    mode: string;
    jobId: string;
    status: string;
    failedReason: string | null;
  };
  facts: {
    hasBrief: boolean;
    hasAnalysis: boolean;
    hasSemantic: boolean;
    hasPlan: boolean;
    planApproved: boolean;
    hasCreatives: boolean;
    criticalIssues: number;
    hasDraft: boolean;
    hasLiveCampaign: boolean;
  };
};

type Me = {
  email: string;
  role: string;
  organizationName: string;
  canWrite: boolean;
  branding: OrgBranding;
  beginnerMode: boolean;
};

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8">
          <PageSkeleton />
        </main>
      }
    >
      <ProjectPageInner />
    </Suspense>
  );
}

function ProjectPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const tab = parseProjectTab(search.get("tab"));
  useEffect(() => {
    if (search.get("tab") === "semantic") {
      const query = new URLSearchParams(search.toString());
      query.set("tab", "plan");
      router.replace(`/projects/${params.id}?${query.toString()}`);
    }
  }, [params.id, router, search]);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [semantic, setSemantic] = useState<SemanticResult | null>(null);
  const [campaignPlan, setCampaignPlan] = useState<CampaignPlanResult | null>(null);
  const [creatives, setCreatives] = useState<CreativesResult | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignsResult | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(
    null,
  );
  const [attribution, setAttribution] = useState<AttributionResult | null>(null);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [opsAlerts, setOpsAlerts] = useState<OpsAlertsResult | null>(null);
  const [auditLog, setAuditLog] = useState<AuditResult | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageResult | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [aiReady, setAiReady] = useState(true);
  const [clientEmail, setClientEmail] = useState("");
  const [specialistEmail, setSpecialistEmail] = useState("");
  const [clientAccess, setClientAccess] = useState<
    Array<{ userId: string; email: string; role: string }>
  >([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [specialistInviteLink, setSpecialistInviteLink] = useState<string | null>(
    null,
  );
  const [attrProvider, setAttrProvider] = useState("bitrix24");
  const [attrToken, setAttrToken] = useState("");
  const [attrExtra, setAttrExtra] = useState("");
  const [inboundHint, setInboundHint] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftBudget, setDraftBudget] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [autopilotConfirm, setAutopilotConfirm] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [customSeedsText, setCustomSeedsText] = useState("");
  const [oauthFlag, setOauthFlag] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [data, analysisData, sem, planData, ads, camp, rep, opt, attr, vis, pipe, notes, journal, llm, user, grants, ai] =
      await Promise.all([
      api<ProjectDetails>(`/projects/${params.id}`),
      api<AnalysisResult>(`/projects/${params.id}/analysis`).catch(() => null),
      api<SemanticResult>(`/projects/${params.id}/semantic`).catch(() => null),
      api<CampaignPlanResult>(`/projects/${params.id}/campaign-plan`).catch(
        () => null,
      ),
      api<CreativesResult>(`/projects/${params.id}/creatives`).catch(
        () => null,
      ),
      api<CampaignsResult>(`/projects/${params.id}/campaigns`).catch(
        () => null,
      ),
      api<ReportResult>(`/projects/${params.id}/reports`).catch(() => null),
      api<OptimizationResult>(`/projects/${params.id}/optimization`).catch(
        () => null,
      ),
      api<AttributionResult>(`/projects/${params.id}/attribution`).catch(
        () => null,
      ),
      api<MediaResult>(`/projects/${params.id}/media`).catch(() => null),
      api<PipelineResult>(`/projects/${params.id}/pipeline`).catch(() => null),
      api<OpsAlertsResult>(`/projects/${params.id}/alerts`).catch(() => null),
      api<AuditResult>(`/projects/${params.id}/audit`).catch(() => null),
      api<LlmUsageResult>(`/projects/${params.id}/llm-usage`).catch(() => null),
      api<Me>("/auth/me"),
      api<Array<{ userId: string; email: string; role: string }>>(
        `/projects/${params.id}/access`,
      ).catch(() => []),
      api<{ ready: boolean }>("/organization/ai-provider").catch(() => ({
        ready: false,
      })),
    ]);
    setProject(data);
    setAnalysis(analysisData);
    setSemantic(
      sem
        ? {
            ...sem,
            negativeSuggestions: sem.negativeSuggestions ?? [],
          }
        : sem,
    );
    setCampaignPlan(planData);
    setCreatives(ads);
    setCampaigns(camp);
    setReport(rep);
    setOptimization(opt);
    setAttribution(attr);
    setMedia(vis);
    setPipeline(pipe);
    setOpsAlerts(notes);
    setAuditLog(journal);
    setLlmUsage(llm);
    setMe(user);
    setAiReady(ai.ready);
    setClientAccess(grants);
    setLoadError(null);
    const nextDrafts: Record<string, string> = {};
    for (const row of ads?.creatives ?? []) {
      nextDrafts[row.id] = row.text;
    }
    setDrafts(nextDrafts);
    if (camp?.draft?.structureJson.campaigns?.[0]) {
      const primary = camp.draft.structureJson.campaigns[0];
      setDraftName(primary.campaign.name);
      setDraftBudget(String(primary.campaign.budget_daily));
    }
  }, [params.id]);

  useEffect(() => {
    setOauthFlag(new URLSearchParams(window.location.search).get("oauth"));
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((err) => {
      const message = err instanceof Error ? err.message : "";
      if (!getToken() || /401|unauthorized|не авторизован/i.test(message)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setLoadError(errorMessage(err, "Не удалось загрузить проект"));
    });
  }, [load, router]);

  useEffect(() => {
    const status = pipeline?.queue?.status;
    if (status !== "queued" && status !== "active") return;
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pipeline?.queue?.status, load]);

  useEffect(() => {
    if (analysis?.customSeeds?.length) {
      setCustomSeedsText(analysis.customSeeds.join("\n"));
    }
  }, [analysis?.customSeeds]);

  async function setProjectPlatform(platform: "yandex_direct" | "google_ads") {
    setError(null);
    setPending(true);
    try {
      const data = await api<ProjectDetails>(`/projects/${params.id}/platform`, {
        method: "PATCH",
        body: JSON.stringify({ primaryPlatform: platform }),
      });
      setProject(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сменить рекламную платформу",
      );
    } finally {
      setPending(false);
    }
  }

  async function connectPlatform() {
    setError(null);
    setPending(true);
    const platform = project?.primaryPlatform ?? "yandex_direct";
    const path =
      platform === "google_ads"
        ? `/projects/${params.id}/oauth/google`
        : `/projects/${params.id}/oauth/yandex`;
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Не удалось начать OAuth ${platformTitle(platform)}`,
      );
      setPending(false);
    }
  }

  async function ackAlert(alertId: string) {
    setError(null);
    try {
      const data = await api<OpsAlertsResult>(
        `/projects/${params.id}/alerts/${alertId}/ack`,
        { method: "POST" },
      );
      setOpsAlerts(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось скрыть оповещение",
      );
    }
  }

  async function runPipeline() {
    setError(null);
    setPending(true);
    try {
      const data = await api<PipelineResult>(
        `/projects/${params.id}/pipeline/run`,
        { method: "POST" },
      );
      setPipeline(data);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось прогнать пайплайн",
      );
    } finally {
      setPending(false);
    }
  }

  async function cancelPipeline() {
    setError(null);
    setPending(true);
    try {
      const data = await api<PipelineResult>(
        `/projects/${params.id}/pipeline/cancel`,
        { method: "POST" },
      );
      setPipeline(data);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось отменить пайплайн",
      );
    } finally {
      setPending(false);
    }
  }

  async function runAnalysis() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/analysis/run`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить анализ",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveCustomSeeds() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/analysis/seeds`, {
        method: "PATCH",
        body: JSON.stringify({ customSeedsText }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить слова",
      );
    } finally {
      setPending(false);
    }
  }

  async function runSemantic() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/semantic/run`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось собрать семантику",
      );
    } finally {
      setPending(false);
    }
  }

  async function resolveNegativeSuggestion(
    suggestionId: string,
    action: "accept" | "reject",
  ) {
    setError(null);
    setPending(true);
    try {
      await api(
        `/projects/${params.id}/semantic/negative-suggestions/${suggestionId}`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось обработать минус-слово",
      );
    } finally {
      setPending(false);
    }
  }

  async function runCampaignPlan() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/campaign-plan/run`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сформировать план",
      );
    } finally {
      setPending(false);
    }
  }

  async function approvePlanAndBuild() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/campaign-plan/approve`, {
        method: "POST",
      });
      await api(`/projects/${params.id}/creatives/run`, { method: "POST" });
      await api(`/projects/${params.id}/campaigns/draft`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось собрать кампании",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveBrief(body: {
    websiteUrl: string;
    geo: string[];
    budgetDaily: number;
    budgetCurrency?: string;
    targetCpl?: number;
    usp: string[];
    targetAudience: Array<{ segment: string }>;
    globalNegativeKeywords: string[];
  }) {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/brief`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить бриф",
      );
      throw err;
    } finally {
      setPending(false);
    }
  }

  async function runCopy() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/creatives/run`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сгенерировать объявления",
      );
    } finally {
      setPending(false);
    }
  }

  async function runMedia(kinds: Array<"image" | "video">) {
    setError(null);
    setPending(true);
    try {
      const data = await api<MediaResult>(`/projects/${params.id}/media/generate`, {
        method: "POST",
        body: JSON.stringify({ kinds }),
      });
      setMedia(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сгенерировать визуальные креативы",
      );
    } finally {
      setPending(false);
    }
  }

  async function mediaAction(assetId: string, action: "approve" | "reject") {
    setError(null);
    setPending(true);
    try {
      const data = await api<MediaResult>(
        `/projects/${params.id}/media/${assetId}/${action}`,
        { method: "POST" },
      );
      setMedia(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось обновить креатив",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveCreative(id: string) {
    const text = drafts[id];
    const current = creatives?.creatives.find((item) => item.id === id);
    if (text == null || text === current?.text) return;
    setError(null);
    try {
      await api(`/projects/${params.id}/creatives/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить объявление",
      );
    }
  }

  async function buildDraft() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/campaigns/draft`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось собрать черновик",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveDraftMeta() {
    const current = campaigns?.draft;
    if (!current?.structureJson.campaigns?.[0]) return;
    const structure = {
      ...current.structureJson,
      campaigns: current.structureJson.campaigns.map((unit, index) =>
        index === 0
          ? {
              ...unit,
              campaign: {
                ...unit.campaign,
                name: draftName.trim() || unit.campaign.name,
                budget_daily:
                  Number(draftBudget) || unit.campaign.budget_daily,
              },
            }
          : unit,
      ),
    };
    setError(null);
    try {
      await api(`/projects/${params.id}/campaigns/draft`, {
        method: "PATCH",
        body: JSON.stringify({ structure }),
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить черновик",
      );
    }
  }

  async function publishCampaign() {
    if (!confirmPublish) return;
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/campaigns/publish`, { method: "POST" });
      setConfirmPublish(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось запустить кампанию в кабинете",
      );
    } finally {
      setPending(false);
    }
  }

  async function collectReport() {
    setReportError(null);
    setPending(true);
    try {
      const data = await api<ReportResult>(
        `/projects/${params.id}/reports/collect`,
        { method: "POST" },
      );
      setReport(data);
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : "Не удалось обновить статистику";
      setReportError(localizeApiError(raw));
    } finally {
      setPending(false);
    }
  }

  async function connectAttribution() {
    setError(null);
    setPending(true);
    try {
      const data = await api<{ inboundUrl: string; inboundSecret: string }>(
        `/projects/${params.id}/attribution/connect`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: attrProvider,
            token: attrToken,
            extra: attrExtra || undefined,
          }),
        },
      );
      setInboundHint(
        `Webhook: ${data.inboundUrl} · секрет (сохраните сейчас): ${data.inboundSecret}`,
      );
      setAttrToken("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось подключить источник",
      );
    } finally {
      setPending(false);
    }
  }

  async function collectAttribution() {
    setError(null);
    setPending(true);
    try {
      const data = await api<AttributionResult>(
        `/projects/${params.id}/attribution/collect`,
        {
          method: "POST",
          body: JSON.stringify({ provider: attrProvider }),
        },
      );
      setAttribution(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось подтянуть лиды",
      );
    } finally {
      setPending(false);
    }
  }

  async function runOptimization() {
    setError(null);
    setPending(true);
    try {
      const data = await api<OptimizationResult>(
        `/projects/${params.id}/optimization/run`,
        { method: "POST" },
      );
      setOptimization(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось построить рекомендации",
      );
    } finally {
      setPending(false);
    }
  }

  async function setAutopilot(enabled: boolean) {
    setError(null);
    setPending(true);
    try {
      const data = await api<OptimizationResult>(
        `/projects/${params.id}/optimization/autopilot`,
        {
          method: "POST",
          body: JSON.stringify({
            enabled,
            confirm: enabled ? autopilotConfirm : undefined,
          }),
        },
      );
      setOptimization(data);
      if (enabled) setAutopilotConfirm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось переключить автопилот",
      );
    } finally {
      setPending(false);
    }
  }

  async function recAction(id: string, action: "approve" | "reject" | "apply") {
    setError(null);
    setPending(true);
    try {
      const data = await api<OptimizationResult>(
        `/projects/${params.id}/optimization/${id}/${action}`,
        { method: "POST" },
      );
      setOptimization(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить действие");
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/disconnect`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить");
    } finally {
      setPending(false);
    }
  }

  async function refreshOAuth() {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/oauth/refresh`, { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось обновить токен",
      );
    } finally {
      setPending(false);
    }
  }

  async function inviteClient() {
    setError(null);
    setInviteLink(null);
    setPending(true);
    try {
      const result = await api<{ invitePath: string; email: string }>(
        `/projects/${params.id}/access`,
        {
          method: "POST",
          body: JSON.stringify({ email: clientEmail, role: "client" }),
        },
      );
      setInviteLink(result.invitePath);
      setClientEmail("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось пригласить клиента",
      );
    } finally {
      setPending(false);
    }
  }

  async function inviteSpecialist() {
    setError(null);
    setSpecialistInviteLink(null);
    setPending(true);
    try {
      const result = await api<{ invitePath: string; email: string }>(
        `/projects/${params.id}/access`,
        {
          method: "POST",
          body: JSON.stringify({ email: specialistEmail, role: "member" }),
        },
      );
      setSpecialistInviteLink(result.invitePath);
      setSpecialistEmail("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось назначить контекстолога",
      );
    } finally {
      setPending(false);
    }
  }

  async function revokeClient(userId: string) {
    setError(null);
    setPending(true);
    try {
      await api(`/projects/${params.id}/access/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отозвать доступ");
    } finally {
      setPending(false);
    }
  }

  if (loadError && !project) {
    return (
      <AppShell
        branding={DEFAULT_BRANDING}
        onLogout={() => router.replace("/login")}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-3 pt-8">
          <ErrorState message={loadError} onRetry={() => void load()} />
          <Link
            href="/projects"
            className="text-center text-sm text-[var(--fg-muted)] underline-offset-2 hover:underline"
          >
            ← Вернуться к портфелю
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell
        branding={me?.branding ?? DEFAULT_BRANDING}
        orgName={me?.organizationName}
        email={me?.email}
        canWrite={me?.canWrite}
        beginnerMode={me?.beginnerMode !== false}
        onBeginnerModeChange={(value) =>
          setMe((prev) => (prev ? { ...prev, beginnerMode: value } : prev))
        }
        onLogout={() => router.replace("/login")}
      >
        <PageSkeleton />
      </AppShell>
    );
  }

  const connected = project.connection.status === "connected";
  const needsReconnect = project.connection.status === "needs_reconnect";
  const hasPlatformCampaigns =
    campaigns?.campaigns.some((item) => item.source !== "external") ?? false;
  const hasAnyCampaigns = (campaigns?.campaigns.length ?? 0) > 0;
  const hasCampaignDraft = Boolean(campaigns?.draft);
  const brief = project.brief;
  const analyzedWebsiteUrl = resolveAnalyzedWebsiteUrl({
    briefWebsiteUrl: brief?.project.website_url,
    analysisWebsiteUrl: analysis?.websiteUrl,
    projectWebsiteUrl: project.websiteUrl,
  });
  const campaignRefs = buildCampaignRefs({
    draftUnits: campaigns?.draft?.structureJson.campaigns,
    liveCampaigns: campaigns?.campaigns,
    plannedNames: campaignPlan?.plan?.campaigns.map((item) => item.name),
  });
  const readOnly = me?.canWrite === false;
  const branding = me?.branding ?? DEFAULT_BRANDING;
  const beginnerMode = me?.beginnerMode !== false;

  function setBeginnerMode(value: boolean) {
    setMe((prev) => (prev ? { ...prev, beginnerMode: value } : prev));
  }

  return (
    <AppShell
      branding={branding}
      orgName={me?.organizationName}
      email={me?.email}
      canWrite={me?.canWrite}
      project={{ id: project.id, name: project.name, status: project.status }}
      tab={tab}
      subtitle={readOnly ? "только просмотр" : undefined}
      beginnerMode={beginnerMode}
      onBeginnerModeChange={setBeginnerMode}
      onLogout={() => router.replace("/login")}
      wide
    >
      {opsAlerts && opsAlerts.alerts.length > 0 ? (
        <Alert tone="alert" className="mb-4" title="Оповещения">
          <ul className="flex flex-col gap-2">
            {opsAlerts.alerts.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.detail ? (
                    <p className="text-xs opacity-80">{item.detail}</p>
                  ) : null}
                </div>
                {!readOnly ? (
                  <Button
                    variant="secondary"
                    className="shrink-0 px-2 py-1 text-xs"
                    onClick={() => ackAlert(item.id)}
                    disabled={pending}
                  >
                    Скрыть
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mb-4">
          {localizeApiError(error)}
        </Alert>
      ) : null}

      {readOnly ? (
        <Alert tone="alert" className="mb-4">
          Кабинет в режиме просмотра: запускать кампании и менять настройки
          может только агентство.
        </Alert>
      ) : (
        <AiProviderNeeded ready={aiReady} />
      )}

      {oauthFlag === "connected" ? (
        <Alert tone="success" className="mb-4">
          {platformTitle(project.primaryPlatform)} подключён.
        </Alert>
      ) : null}
      {oauthFlag === "needs_reconnect" ? (
        <Alert tone="danger" className="mb-4" title="Подключение не завершено">
          Нужны права на управление кампаниями — переподключите кабинет{" "}
          {platformTitle(project.primaryPlatform)}.
          {project.connection.verificationError ? (
            <span className="mt-1 block text-xs opacity-80">
              {project.connection.verificationError}
            </span>
          ) : null}
        </Alert>
      ) : null}
      {needsReconnect && oauthFlag !== "needs_reconnect" ? (
        <Alert tone="danger" className="mb-4" title="Требуется переподключение">
          Подключение к {platformTitle(project.primaryPlatform)} перестало работать
          {project.connection.verificationError
            ? `: ${project.connection.verificationError}`
            : ""}
          . Переподключите кабинет, чтобы снова синхронизировать кампании и статистику.
        </Alert>
      ) : null}
      {oauthFlag === "error" ? (
        <Alert tone="danger" className="mb-4">
          Не удалось подключить {platformTitle(project.primaryPlatform)}.
          Проверьте OAuth-настройки.
        </Alert>
      ) : null}

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Пайплайн до черновика</CardTitle>
            <CardHint>
              Детерминированная очередь: бриф → анализ → план → объявления → черновик.
              «Прогнать пайплайн» проходит этапы автоматически. Публикация — только
              явным «Запустить кампанию».
            </CardHint>
          </div>
        </div>
        <PipelineProgress projectId={params.id} pipeline={pipeline} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={runPipeline}
            disabled={
              pending ||
              readOnly ||
              !aiReady ||
              !pipeline?.fullRunAvailable ||
              pipeline?.queue?.status === "queued" ||
              pipeline?.queue?.status === "active"
            }
          >
            {pipeline?.queue?.status === "queued" ||
            pipeline?.queue?.status === "active"
              ? "В очереди…"
              : pending
                ? "Идёт пайплайн…"
                : "Прогнать пайплайн до черновика"}
          </Button>
          {pipeline?.canCancel ? (
            <Button
              variant="secondary"
              onClick={() => void cancelPipeline()}
              disabled={pending || readOnly}
            >
              {pending ? "Отменяем…" : "Отменить и доработать"}
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Подключение кабинета</CardTitle>
          <span className="font-mono text-[11px] text-[var(--outline)]">
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                connected
                  ? "bg-[var(--secondary)]"
                  : needsReconnect
                    ? "bg-[var(--status-alert-fg)]"
                    : "bg-[var(--fg-faint)]"
              }`}
            />
            {connected
              ? "online"
              : needsReconnect
                ? "needs_reconnect"
                : "offline"}
          </span>
        </div>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Платформа проекта:{" "}
          <span className="font-medium text-[var(--fg)]">
            {platformTitle(project.primaryPlatform)}
          </span>
          {connected
            ? ` · ${project.connection.externalAccountId ?? "аккаунт"}`
            : needsReconnect
              ? " · подключение не завершено — нужны права API"
              : " · кабинет не подключён"}
          {connected && project.connection.expiresAt
            ? ` · до ${new Date(project.connection.expiresAt).toLocaleString("ru-RU")}`
            : ""}
        </p>
        {!connected && !needsReconnect && !readOnly ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  id: "yandex_direct" as const,
                  title: "Яндекс Директ",
                  hint: "OAuth + Direct API",
                },
                {
                  id: "google_ads" as const,
                  title: "Google Ads",
                  hint: "OAuth + Google Ads API",
                },
              ] as const
            ).map((item) => {
              const active = project.primaryPlatform === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={pending}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
                      : "border-[var(--border)] bg-[var(--bg-mid)] hover:bg-[var(--bg-high)]"
                  }`}
                  onClick={() => {
                    if (!active) void setProjectPlatform(item.id);
                  }}
                >
                  <span className="block text-sm font-medium text-[var(--fg)]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-[var(--fg-faint)]">
                    {item.hint}
                    {active ? " · выбрано" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {needsReconnect ? (
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            Токен получен, но API рекламного кабинета не отвечает. Переподключите
            аккаунт с нужными правами.
            {project.connection.verificationError ? (
              <span className="mt-1 block text-xs opacity-80">
                {project.connection.verificationError}
              </span>
            ) : null}
          </p>
        ) : null}
        {connected && !hasPlatformCampaigns && !hasAnyCampaigns ? (
          <p className="mt-2 text-sm text-[var(--fg-muted)]">
            {hasCampaignDraft
              ? "Черновик кампании готов — для статистики откройте вкладку «Кампания» и нажмите «Запустить кампанию»."
              : "Для статистики сначала соберите и опубликуйте кампанию."}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {!connected || needsReconnect ? (
            <Button
              onClick={connectPlatform}
              disabled={pending || readOnly}
            >
              {needsReconnect
                ? `Переподключить ${platformTitle(project.primaryPlatform)}`
                : `Подключить ${platformTitle(project.primaryPlatform)}`}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={refreshOAuth}
                disabled={pending || readOnly}
              >
                Обновить токен
              </Button>
              <Button
                variant="secondary"
                onClick={disconnect}
                disabled={pending || readOnly}
              >
                Отключить аккаунт
              </Button>
            </>
          )}
        </div>
        {!connected && project.primaryPlatform === "google_ads" ? (
          <p className="mt-3 text-xs text-[var(--fg-faint)]">
            Нужен живой OAuth-токен с правом на{" "}
            <span className="font-medium">клиентский</span> кабинет (не только
            MCC). Управляющий аккаунт задаёт developer token /{" "}
            <span className="font-mono">LOGIN_CUSTOMER_ID</span>; кампании
            создаются в подчинённом customer id. Нажмите «Переподключить».
          </p>
        ) : null}
      </Card>

      {tab === "audit" ? (
      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-2 font-medium">Журнал записей в кабинет</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Кто и когда менял кампании в Директе или Google Ads. Токены не
          сохраняются.
        </p>
        {auditLog && auditLog.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr className="text-[var(--fg-muted)]">
                  <th className="py-1 pr-2">Когда</th>
                  <th className="py-1 pr-2">Кто</th>
                  <th className="py-1 pr-2">Действие</th>
                  <th className="py-1 pr-2">Статус</th>
                  <th className="py-1">Детали</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.items.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)] align-top">
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("ru-RU")}
                    </td>
                    <td className="py-2 pr-2">
                      {AUDIT_ACTOR[row.actor] ?? row.actor}
                      {row.actorEmail ? ` · ${row.actorEmail}` : ""}
                    </td>
                    <td className="py-2 pr-2">
                      {AUDIT_ACTION[row.action] ?? row.action}
                    </td>
                    <td className="py-2 pr-2">
                      {row.status === "failed" ? "ошибка" : "успех"}
                    </td>
                    <td className="py-2 text-xs text-[var(--fg-muted)]">
                      {row.error ??
                        (row.summary ? JSON.stringify(row.summary) : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Запустите кампанию или примените рекомендацию">
            Журнал появится после записи в кабинет. Откройте вкладку «Кампания»
            и нажмите «Запустить кампанию», либо «Рекомендации» → «Применить в
            кабинет».
          </EmptyState>
        )}
      </section>
      ) : null}

      {tab === "spend" ? (
      <Card>
        <CardTitle>Расходы LLM</CardTitle>
        <CardHint>
          Вызовы моделей по этому проекту. Полный промпт в UI не показывается,
          токены и ключи вырезаются.
        </CardHint>
        {llmUsage && llmUsage.summary.calls > 0 ? (
          <>
            <KpiGrid cols={4}>
              <KpiCard label="Вызовы" value={String(llmUsage.summary.calls)} />
              <KpiCard
                label="Стоимость"
                value={`$${llmUsage.summary.costUsd.toFixed(4)}`}
                tone="accent"
              />
              <KpiCard
                label="Вход"
                value={llmUsage.summary.inputTokens.toLocaleString("ru-RU")}
              />
              <KpiCard
                label="Выход"
                value={llmUsage.summary.outputTokens.toLocaleString("ru-RU")}
                tone="secondary"
              />
            </KpiGrid>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {llmUsage.summary.byAgent.length > 0 ? (
                <BarChart
                  label="Стоимость по агентам ($)"
                  items={llmUsage.summary.byAgent.map((row) => ({
                    id: row.agentType,
                    label: LLM_AGENT[row.agentType] ?? row.agentType,
                    value: row.costUsd,
                  }))}
                  format={(v) => `$${v.toFixed(4)}`}
                />
              ) : null}
              {llmUsage.summary.byAgent.length > 0 ? (
                <DonutChart
                  centerLabel="вызовы"
                  centerValue={String(llmUsage.summary.calls)}
                  segments={llmUsage.summary.byAgent.map((row, index) => ({
                    id: row.agentType,
                    label: LLM_AGENT[row.agentType] ?? row.agentType,
                    value: row.calls,
                    color: [
                      "var(--accent)",
                      "var(--secondary)",
                      "var(--status-alert-fg)",
                      "var(--accent-soft)",
                      "#7dd3fc",
                    ][index % 5],
                  }))}
                />
              ) : null}
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Агент</th>
                    <th>Модель</th>
                    <th>$</th>
                    <th>Превью</th>
                  </tr>
                </thead>
                <tbody>
                  {llmUsage.recent.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap font-mono text-xs">
                        {new Date(row.createdAt).toLocaleString("ru-RU")}
                      </td>
                      <td>
                        {LLM_AGENT[row.agentType] ?? row.agentType}
                        <span className="block text-xs text-[var(--fg-faint)]">
                          {row.step}
                        </span>
                      </td>
                      <td className="font-mono text-xs">{row.model}</td>
                      <td className="font-mono text-xs">${row.costUsd.toFixed(4)}</td>
                      <td className="text-xs text-[var(--fg-muted)]">
                        {row.promptPreview || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="Соберите семантику или объявления, чтобы увидеть расход">
            Вызовы модели появятся после «Собрать семантику», «Сгенерировать
            объявления», отчёта или генерации картинок. Нажмите «Прогнать
            пайплайн до черновика» в шапке проекта.
          </EmptyState>
        )}
      </Card>
      ) : null}

      {tab === "brief" && me?.canWrite ? (
        <section className="ui-panel relative mb-4 p-4">
          <h2 className="mb-2 font-medium">Доступ к проекту</h2>
          {me.role === "owner" ? (
            <>
              <h3 className="mb-1 text-sm font-medium">Контекстолог агентства</h3>
              <p className="mb-3 text-sm text-[var(--fg-muted)]">
                Видит только назначенные проекты в портфеле, но может собирать
                семантику, объявления и запускать кампании на паузе — как
                владелец на этих кабинетах.
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  className="ui-input min-w-56 flex-1"
                  type="email"
                  placeholder="email контекстолога"
                  value={specialistEmail}
                  onChange={(event) => setSpecialistEmail(event.target.value)}
                />
                <Button
                  type="button"
                  onClick={() => void inviteSpecialist()}
                  disabled={pending || !specialistEmail}
                >
                  Назначить
                </Button>
              </div>
              {specialistInviteLink ? (
                <Alert tone="success" className="mb-4 break-all text-xs">
                  Ссылка для контекстолога: {specialistInviteLink}
                </Alert>
              ) : null}
            </>
          ) : null}
          <h3 className="mb-1 text-sm font-medium">Субклиент (только просмотр)</h3>
          <p className="mb-3 text-sm text-[var(--fg-muted)]">
            Клиент видит только этот проект и не может публиковать кампании.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              className="ui-input min-w-56 flex-1"
              type="email"
              placeholder="email клиента"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
            />
            <Button
              type="button"
              onClick={() => void inviteClient()}
              disabled={pending || !clientEmail}
            >
              Пригласить
            </Button>
          </div>
          {inviteLink ? (
            <Alert tone="success" className="mb-2 break-all text-xs">
              Ссылка для субклиента: {inviteLink}
            </Alert>
          ) : null}
          {clientAccess.length > 0 ? (
            <ul className="text-sm">
              {clientAccess.map((item) => (
                <li
                  key={item.userId}
                  className="flex items-center justify-between gap-2 border-t border-[var(--border)] py-1"
                >
                  <span>
                    {item.email} · {accessRoleLabel(item.role)}
                  </span>
                  <button
                    className="text-xs underline disabled:opacity-50"
                    onClick={() => revokeClient(item.userId)}
                    disabled={pending}
                  >
                    Отозвать
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">Пока никого не приглашали</p>
          )}
          </section>
      ) : null}

      {tab === "analytics" ? (
      <AnalyticsPanel
        projectId={params.id}
        report={report}
        attribution={attribution}
        pending={pending}
        readOnly={readOnly}
        inboundHint={inboundHint}
        attrProvider={attrProvider}
        attrToken={attrToken}
        attrExtra={attrExtra}
        setAttrProvider={setAttrProvider}
        setAttrToken={setAttrToken}
        setAttrExtra={setAttrExtra}
        onCollectReport={collectReport}
        onConnectAttribution={connectAttribution}
        onCollectAttribution={collectAttribution}
        cabinetConnected={connected}
        cabinetNeedsReconnect={needsReconnect}
        hasPlatformCampaigns={hasPlatformCampaigns}
        hasAnyCampaigns={hasAnyCampaigns}
        hasCampaignDraft={hasCampaignDraft}
        reportError={reportError}
        analyzedWebsiteUrl={analyzedWebsiteUrl}
        platform={project.primaryPlatform}
        campaignRefs={campaignRefs}
      />
      ) : null}

      {tab === "recs" || tab === "autopilot" ? (
      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-2 font-medium">Рекомендации</h2>
        {tab === "autopilot" ? (
          <h3 className="mb-2 text-sm font-semibold">Автопилот</h3>
        ) : null}
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          {optimization?.autopilot
            ? "Автопилот включён для этого проекта: пауза, урезание бюджета и минус-слова уходят в кабинет без второго клика. Новые кампании автопилот не публикует."
            : "Автопилот выключен. Агент только предлагает действия по цифрам статистики; в кабинет они попадают после «Принять» и «Применить»."}
          {optimization?.task
            ? ` Задача: ${optimization.task.status}${optimization.task.error ? ` · ${optimization.task.error}` : ""}`
            : ""}
        </p>
        {optimization?.eligibility ? (
          <div className="mb-3 rounded border border-[var(--border)] p-3 text-sm">
            <p className="text-xs text-[var(--fg-muted)]">
              Порог автопилота: разобрано{" "}
              {optimization.eligibility.stats.reviewed} · применено{" "}
              {optimization.eligibility.stats.applied} · доля{" "}
              {optimization.eligibility.stats.acceptRate == null
                ? "—"
                : `${Math.round(optimization.eligibility.stats.acceptRate * 100)}%`}
            </p>
            {optimization.eligibility.eligible ? (
              <Alert tone="success" className="mt-2">
                Качество рекомендаций достаточное, чтобы включить автопилот.
              </Alert>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-[var(--fg-muted)]">
                {optimization.eligibility.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {!readOnly ? (
          <div className="mb-4 flex flex-col gap-2">
            {optimization?.autopilot ? (
              <button
                className={btnClass("secondary", "w-fit")}
                onClick={() => setAutopilot(false)}
                disabled={pending}
              >
                Выключить автопилот
              </button>
            ) : (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autopilotConfirm}
                    onChange={(e) => setAutopilotConfirm(e.target.checked)}
                    disabled={pending || !optimization?.eligibility?.eligible}
                  />
                  Понимаю: автопилот сам применит паузу, урезание бюджета и
                  минус-слова. Новые кампании без моего подтверждения не
                  создаются.
                </label>
                <button
                  className={btnClass("secondary", "w-fit")}
                  onClick={() => setAutopilot(true)}
                  disabled={
                    pending ||
                    !autopilotConfirm ||
                    !optimization?.eligibility?.eligible
                  }
                >
                  Включить автопилот
                </button>
              </>
            )}
          </div>
        ) : null}
        <OptimizationScheduleBanner
          projectId={params.id}
          launchedAt={optimization?.optimizationLaunchedAt ?? null}
          lastRunAt={optimization?.optimizationLastRunAt ?? null}
          nextRunAt={optimization?.optimizationNextRunAt ?? null}
          hasPublishedCampaigns={hasPlatformCampaigns}
        />
        <button
          className={btnClass("primary", "mb-4")}
          onClick={runOptimization}
          disabled={pending || readOnly || !aiReady}
        >
          {pending ? "Считаем…" : "Построить рекомендации сейчас"}
        </button>
        {optimization && optimization.recommendations.length > 0 ? (
          <ul className="flex flex-col gap-3 text-sm">
            {optimization.recommendations.map((item) => (
              <li
                key={item.id}
                className="rounded border border-[var(--border)] p-3"
              >
                <p className="text-xs text-[var(--fg-muted)]">
                  {item.type} · {item.status}
                  {item.appliedBy ? ` · ${item.appliedBy}` : ""} · кампания{" "}
                  {item.campaignExternalId}
                </p>
                <p className="mt-1">{item.rationale}</p>
                {item.evidence &&
                typeof item.evidence === "object" &&
                "period_from" in item.evidence &&
                "period_to" in item.evidence ? (
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Период: {formatDateRu(String(item.evidence.period_from))} —{" "}
                    {formatDateRu(String(item.evidence.period_to))}
                    {"spend" in item.evidence
                      ? ` · расход ${String(item.evidence.spend)}`
                      : ""}
                    {"ctr" in item.evidence
                      ? ` · CTR ${String(item.evidence.ctr)}%`
                      : ""}
                  </p>
                ) : null}
                {item.error ? (
                  <p className="mt-1 text-[var(--status-danger-fg)]">{item.error}</p>
                ) : null}
                {!optimization.autopilot ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.status === "proposed" ? (
                      <>
                        <button
                          className={btnClass("primary", "px-3 py-1")}
                          onClick={() => recAction(item.id, "approve")}
                          disabled={pending || readOnly}
                        >
                          Принять
                        </button>
                        <button
                          className={btnClass("secondary", "px-3 py-1")}
                          onClick={() => recAction(item.id, "reject")}
                          disabled={pending || readOnly}
                        >
                          Отклонить
                        </button>
                      </>
                    ) : null}
                    {item.status === "approved" || item.status === "failed" ? (
                      <button
                        className={btnClass("primary", "px-3 py-1")}
                        onClick={() => recAction(item.id, "apply")}
                        disabled={pending || readOnly || !connected}
                      >
                        Применить в кабинет
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Рекомендации появятся автоматически">
            После публикации кампании агент проверит статистику по расписанию.
            Для внепланового прогона нажмите кнопку выше — нужны снимки из
            кабинета на вкладке «Аналитика».
          </EmptyState>
        )}
      </section>
      ) : null}

      {tab === "analysis" ? (
      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-2 font-medium">Анализ сайта и брифа</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Перед сбором семантики агент загружает главную страницу сайта и
          объясняет, на что опирается при подборе ключевых фраз.
        </p>
        <div className="mb-4">
          <ProjectContextPanel
            websiteUrl={analyzedWebsiteUrl}
            platform={project.primaryPlatform}
            connected={connected}
            campaignRefs={campaignRefs}
          />
        </div>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          {analysis?.task
            ? `Задача: ${analysis.task.status}${analysis.task.error ? ` · ${analysis.task.error}` : ""}`
            : analysis?.ready
              ? `Готово${analysis.llmMode ? ` · модель ${analysis.llmMode}` : ""}`
              : "Анализ ещё не выполнялся"}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={btnClass("primary")}
            onClick={runAnalysis}
            disabled={pending || readOnly || !brief || !aiReady}
          >
            {pending ? "Анализируем…" : analysis?.ready ? "Перезапустить анализ" : "Запустить анализ"}
          </button>
        </div>
        {analysis?.ready && analysis.explanation ? (
          <div className="mb-4 rounded border border-[var(--border)] bg-[var(--bg-mid)] p-4 text-sm whitespace-pre-wrap">
            {analysis.explanation}
          </div>
        ) : (
          <EmptyState title="Анализ не выполнен">
            Заполните бриф и нажмите «Запустить анализ». После этого появится
            объяснение и кнопка сбора семантики.
          </EmptyState>
        )}
        {analysis?.ready ? (
          <>
            <label className="mb-1 block text-sm font-medium">
              Добавить свои слова
            </label>
            <p className="mb-2 text-xs text-[var(--fg-muted)]">
              По одному на строку или через запятую — попадут в seed-список
              наравне с масками из брифа.
            </p>
            <textarea
              className="mb-3 min-h-[96px] w-full rounded border border-[var(--border)] p-2 text-sm"
              value={customSeedsText}
              onChange={(event) => setCustomSeedsText(event.target.value)}
              disabled={pending || readOnly}
              placeholder={"ноутбук для офиса\nзакупка техники оптом"}
            />
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                className={btnClass("secondary")}
                onClick={saveCustomSeeds}
                disabled={pending || readOnly}
              >
                Сохранить слова
              </button>
              <button
                className={btnClass("primary")}
                onClick={async () => {
                  if (customSeedsText.trim()) {
                    await saveCustomSeeds();
                  }
                  await runSemantic();
                  router.push(`/projects/${params.id}?tab=plan`);
                }}
                disabled={pending || readOnly || !aiReady}
              >
                {pending ? "Собираем…" : "Собрать семантику → План"}
              </button>
            </div>
          </>
        ) : null}
      </section>
      ) : null}

      {tab === "plan" ? (
      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-1 text-base font-semibold tracking-tight">
          Семантика и план запуска
        </h2>
        <p className="mb-4 text-sm text-[var(--fg-muted)]">
          Здесь же: «Собрать семантику», кластеры, минус-слова, экспорт CSV/XLSX,
          структура кампаний и «Ок, собирай». Раньше это была отдельная вкладка
          «Семантика» — функциональность на месте.
        </p>
        <div className="mb-4">
          <ProjectContextPanel
            websiteUrl={analyzedWebsiteUrl}
            platform={project.primaryPlatform}
            connected={connected}
            campaignRefs={campaignRefs}
            compact
          />
        </div>
        <PlanReviewPanel
          semantic={
            semantic
              ? {
                  clusters: semantic.clusters,
                  negativeSuggestions: semantic.negativeSuggestions ?? [],
                }
              : null
          }
          semanticTask={semantic?.task ?? null}
          briefNegatives={brief?.exclusions.global_negative_keywords ?? []}
          campaignPlan={campaignPlan}
          readOnly={readOnly}
          pending={pending}
          aiReady={aiReady}
          hasAnalysis={Boolean(pipeline?.facts.hasAnalysis)}
          onRunSemantic={() => void runSemantic()}
          onExportCsv={() =>
            void downloadAuthenticated(
              `/projects/${params.id}/semantic/export?format=csv&commercial=1`,
              "semantic-commercial.csv",
            )
          }
          onExportXlsx={() =>
            void downloadAuthenticated(
              `/projects/${params.id}/semantic/export?format=xlsx&commercial=1`,
              "semantic-commercial.xls",
            )
          }
          onRunPlan={runCampaignPlan}
          onApprove={approvePlanAndBuild}
          onResolveNegative={resolveNegativeSuggestion}
        />
      </section>
      ) : null}

      {tab === "ads" ? (
      <>
      <CreativesPanel
        data={creatives}
        drafts={drafts}
        onDraftChange={(id, text) =>
          setDrafts((prev) => ({ ...prev, [id]: text }))
        }
        onSave={saveCreative}
        onGenerate={runCopy}
        generateDisabled={
          pending ||
          readOnly ||
          !brief ||
          !semantic ||
          semantic.clusters.length === 0 ||
          !aiReady ||
          !pipeline?.facts.planApproved
        }
        generatePending={pending}
        generateLabel="Сгенерировать объявления"
      />

      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-2 font-medium">Визуальные креативы</h2>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Изображения и видео через MediaGenerationConnector. В рекламный
          кабинет не публикуются — только превью и утверждение в платформе.
          {media?.task
            ? ` Задача: ${media.task.status}${media.task.error ? ` · ${media.task.error}` : ""}`
            : ""}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={btnClass("primary")}
            onClick={() => runMedia(["image"])}
            disabled={
              pending ||
              readOnly ||
              !aiReady ||
              !brief ||
              !semantic ||
              semantic.clusters.length === 0
            }
          >
            {pending ? "Генерируем…" : "Сгенерировать изображения"}
          </button>
          <button
            className={btnClass("secondary")}
            onClick={() => runMedia(["video"])}
            disabled={
              pending ||
              readOnly ||
              !aiReady ||
              !brief ||
              !semantic ||
              semantic.clusters.length === 0
            }
          >
            Сгенерировать видео
          </button>
        </div>
        {media && media.assets.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {media.assets.map((item) => (
              <li
                key={item.id}
                className="rounded border border-[var(--border)] p-3 text-sm"
              >
                <MediaPreview
                  projectId={params.id}
                  assetId={item.id}
                  kind={item.kind}
                  mimeType={item.mimeType}
                />
                <p className="mt-2 text-xs text-[var(--fg-muted)]">
                  {item.kind === "video" ? "Видео" : "Изображение"}
                  {item.durationMs ? ` · ${Math.round(item.durationMs / 1000)} с` : ""}
                  {" · "}
                  {item.status} · {item.provider}
                  {item.clusterName ? ` · ${item.clusterName}` : ""}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-[var(--fg-muted)]">
                  {item.prompt}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.status === "generated" ? (
                    <>
                      <button
                        className={btnClass("primary", "px-3 py-1")}
                        onClick={() => mediaAction(item.id, "approve")}
                        disabled={pending || readOnly}
                      >
                        Утвердить
                      </button>
                      <button
                        className={btnClass("secondary", "px-3 py-1")}
                        onClick={() => mediaAction(item.id, "reject")}
                        disabled={pending || readOnly}
                      >
                        Отклонить
                      </button>
                    </>
                  ) : null}
                  {item.status === "approved" ? (
                    <button
                      className={btnClass("secondary", "px-3 py-1")}
                      onClick={() => mediaAction(item.id, "reject")}
                      disabled={pending || readOnly}
                    >
                      Отклонить
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Соберите семантику, затем сгенерируйте изображения">
            На вкладке «Семантика · План» нажмите «Собрать семантику», вернитесь сюда и
            нажмите «Сгенерировать изображения». В рекламный кабинет файлы не
            уходят.
          </EmptyState>
        )}
      </section>
      </>
      ) : null}

      {tab === "campaign" ? (
      <section className="ui-panel relative mb-4 p-4">
        <h2 className="mb-2 font-medium">Кампания</h2>
        <div className="mb-4">
          <ProjectContextPanel
            websiteUrl={analyzedWebsiteUrl}
            platform={project.primaryPlatform}
            connected={connected}
            campaignRefs={campaignRefs}
            compact
          />
        </div>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          {campaigns?.task
            ? `Черновик: ${campaigns.task.status}`
            : "Черновик ещё не собирался"}
          {campaigns?.draft ? ` · ${campaigns.draft.status}` : ""}
        </p>
        <button
          className={btnClass("primary", "mb-4")}
          onClick={buildDraft}
          disabled={
            pending || readOnly || !creatives || creatives.creatives.length === 0
          }
        >
          {pending ? "Собираем…" : "Собрать черновик кампании"}
        </button>
        {campaigns?.draft ? (
          <div className="flex flex-col gap-4 text-sm">
            {campaigns.draft.structureJson.campaigns.map((unit, unitIndex) => (
              <div
                key={`${unit.campaign.name}-${unitIndex}`}
                className="rounded border border-[var(--border)] p-3"
              >
                <p className="mb-2 font-medium">{unit.campaign.name}</p>
                {unit.publish?.externalCampaignId ? (
                  <p className="mb-2 text-xs text-[var(--fg-muted)]">
                    ID в {platformTitle(project.primaryPlatform)}:{" "}
                    {cabinetCampaignUrl(
                      project.primaryPlatform,
                      unit.publish.externalCampaignId,
                    ) ? (
                      <a
                        href={
                          cabinetCampaignUrl(
                            project.primaryPlatform,
                            unit.publish.externalCampaignId,
                          )!
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-medium underline-offset-2 hover:underline"
                      >
                        №{unit.publish.externalCampaignId}
                      </a>
                    ) : (
                      <span className="font-mono font-medium">
                        №{unit.publish.externalCampaignId}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mb-2 text-xs text-[var(--fg-muted)]">
                    После публикации здесь появится номер кампании в{" "}
                    {platformTitle(project.primaryPlatform)} — сейчас это только
                    черновик «{unit.campaign.name}».
                  </p>
                )}
                <p>
                  Бюджет: {unit.campaign.budget_daily}{" "}
                  {unit.campaign.currency} · гео:{" "}
                  {unit.campaign.geo.join(", ")} · сайт: {unit.campaign.href}
                </p>
                {unit.ad_groups.map((group) => (
                  <div key={group.name} className="mt-2 rounded border border-[var(--border)] p-2">
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-[var(--fg-muted)]">
                      Ключи: {group.keywords.slice(0, 8).join(", ")}
                      {group.keywords.length > 8 ? "…" : ""}
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {group.ads.map((ad) => (
                        <li key={`${group.name}-${ad.ab_group}`}>
                          [{ad.ab_group}] {ad.headline1} / {ad.headline2} —{" "}
                          {ad.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {unit.publish?.error ? (
                  <p className="mt-2 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-2 text-[var(--status-danger-fg)]">
                    Сбой на шаге {unit.publish.step}: {unit.publish.error}
                  </p>
                ) : null}
              </div>
            ))}
            <label className="flex flex-col gap-1">
              Название (первая кампания)
              <input
                className="ui-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveDraftMeta}
              />
            </label>
            <label className="flex flex-col gap-1">
              Бюджет в день (
              {campaigns.draft.structureJson.campaigns[0]?.campaign.currency})
              <input
                className="ui-input"
                value={draftBudget}
                onChange={(event) => setDraftBudget(event.target.value)}
                onBlur={saveDraftMeta}
              />
            </label>
            <Alert tone="info" title="Что произойдёт при нажатии «Запустить»">
              Кампания создастся в {platformTitle(project.primaryPlatform)} в
              статусе «на паузе». Показы не начнутся и бюджет не спишется, пока
              вы сами не активируете её в кабинете рекламной платформы.
              <BeginnerNote term="paused" className="mt-2" />
            </Alert>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmPublish}
                onChange={(event) => setConfirmPublish(event.target.checked)}
              />
              Создать кампанию в {platformTitle(project.primaryPlatform)} на
              паузе (без показа). Подтверждаю запуск согласно{" "}
              <Link href="/terms" className="underline" target="_blank">
                условиям
              </Link>
            </label>
            <button
              className={btnClass("primary", "w-fit")}
              onClick={publishCampaign}
              disabled={pending || readOnly || !confirmPublish || !connected}
            >
              Запустить кампанию
            </button>
            {!connected ? (
              <p className="text-xs text-[var(--fg-muted)]">
                Сначала подключите кабинет {platformTitle(project.primaryPlatform)}.
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Сначала сгенерируйте объявления, затем соберите черновик">
            Откройте вкладку «Объявления» и нажмите «Сгенерировать объявления»,
            затем вернитесь и нажмите «Собрать черновик кампании» — или
            прогоните пайплайн до черновика в шапке проекта.
          </EmptyState>
        )}
        {campaigns && campaigns.campaigns.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium">
              Опубликованные кампании в кабинете
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
            {campaigns.campaigns
              .filter((item) => item.source !== "external")
              .map((item) => {
                const ref = campaignRefs.find(
                  (row) => row.externalCampaignId === item.externalCampaignId,
                );
                const cabinetUrl = cabinetCampaignUrl(
                  project.primaryPlatform,
                  item.externalCampaignId,
                );
                return (
              <li
                key={item.id}
                className="rounded border border-[var(--border)] px-3 py-2"
              >
                <p className="font-medium">
                  {ref?.internalName ?? item.name ?? `Кампания ${item.externalCampaignId}`}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  ID в {platformTitle(project.primaryPlatform)}:{" "}
                  {cabinetUrl ? (
                    <a
                      href={cabinetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      №{item.externalCampaignId}
                    </a>
                  ) : (
                    <span className="font-mono">№{item.externalCampaignId}</span>
                  )}
                  {" · "}
                  <StatusBadge value={item.status} map="campaign" />
                  {item.budget != null ? ` · бюджет ${item.budget}` : ""}
                </p>
              </li>
                );
              })}
          </ul>
          </div>
        ) : null}
      </section>
      ) : null}

      {tab === "brief" ? (
      <section className="ui-panel relative p-4">
        <h2 className="mb-3 font-medium">Бриф</h2>
        <BriefEditor
          brief={brief}
          websiteUrl={project.websiteUrl}
          readOnly={readOnly}
          pending={pending}
          onSave={saveBrief}
        />
      </section>
      ) : null}
    </AppShell>
  );
}

function accessRoleLabel(role: string): string {
  if (role === "member") return "контекстолог";
  if (role === "client") return "субклиент";
  if (role === "owner") return "владелец";
  return role;
}

function MediaPreview({
  projectId,
  assetId,
  kind,
  mimeType,
}: {
  projectId: string;
  assetId: string;
  kind: "image" | "video";
  mimeType: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    void fetch(`${API_URL}/projects/${projectId}/media/${assetId}/file`, {
      headers,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        const next = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, assetId]);

  if (!url) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (kind === "video" && mimeType.startsWith("video/")) {
    return (
      <video src={url} className="h-32 w-full rounded object-cover" controls />
    );
  }
  return <img src={url} alt="" className="h-32 w-full rounded object-cover" />;
}
