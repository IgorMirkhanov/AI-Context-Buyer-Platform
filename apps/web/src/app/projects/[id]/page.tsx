"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, API_URL, clearToken, downloadAuthenticated, getToken } from "@/lib/api";
import { DEFAULT_BRANDING, OrgBranding } from "@/lib/branding";
import { AiProviderNeeded } from "@/components/ai-provider-needed";
import { AppShell } from "@/shell/app-shell";
import { parseProjectTab } from "@/shell/project-tabs";
import { Alert } from "@/ui/alert";
import { Badge, IssueBadge, StatusBadge } from "@/ui/badge";
import { btnClass, Button } from "@/ui/button";
import { Card, CardHint, CardTitle } from "@/ui/card";
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from "@/ui/states";
import { AnalyticsPanel, type AttributionResult, type ReportResult } from "@/components/analytics-panel";
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

type SemanticResult = {
  task: { status: string; error: string | null } | null;
  clusters: Array<{
    id: string;
    name: string;
    category: string;
    keywords: Array<{
      phrase: string;
      intent: string;
      frequency: number;
      source: string;
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

const INTENT_WHY: Record<string, string> = {
  hot: "горячий интент — ближе к покупке",
  warm: "тёплый интент — сравнение и выбор",
  navigational: "навигационный интент — бренд или сайт",
};

function keywordWhy(kw: { intent: string; source: string }): string {
  const intent = INTENT_WHY[kw.intent] ?? `интент: ${kw.intent}`;
  const source = kw.source ? `источник: ${kw.source}` : "источник не указан";
  return `${intent}; ${source}`;
}

function formatShare(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

const TYPE_LABEL: Record<string, string> = {
  headline1: "Заголовок 1",
  headline2: "Заголовок 2",
  description: "Описание",
  sitelink: "Быстрая ссылка",
  callout: "Уточнение",
};

function platformTitle(platform: string): string {
  return platform === "google_ads" ? "Google Ads" : "Яндекс Директ";
}

type CampaignsResult = {
  task: { status: string; error: string | null } | null;
  draft: {
    id: string;
    status: string;
    structureJson: {
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
      global_negatives: string[];
      publish?: { step?: string; error?: string; externalCampaignId?: string };
    };
  } | null;
  campaigns: Array<{
    id: string;
    externalCampaignId: string;
    status: string;
    budget: string | number | null;
  }>;
};

type OptimizationResult = {
  task: { status: string; error: string | null } | null;
  autopilot: boolean;
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
    status: "connected" | "not_connected";
    platform: string;
    externalAccountId: string | null;
    expiresAt: string | null;
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
  semantic: "Семантика",
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
  queue?: {
    mode: string;
    jobId: string;
    status: string;
    failedReason: string | null;
  };
  facts: {
    hasBrief: boolean;
    hasSemantic: boolean;
    hasCreatives: boolean;
    criticalIssues: number;
    hasDraft: boolean;
    hasLiveCampaign: boolean;
  };
};

const PIPELINE_TRACK: Array<{ id: string; label: string }> = [
  { id: "brief_submitted", label: "Бриф" },
  { id: "semantic_ready", label: "Семантика" },
  { id: "copy_ready", label: "Объявления" },
  { id: "awaiting_approval", label: "Черновик" },
  { id: "launched", label: "Запуск" },
];

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
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [semantic, setSemantic] = useState<SemanticResult | null>(null);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [oauthFlag, setOauthFlag] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [data, sem, ads, camp, rep, opt, attr, vis, pipe, notes, journal, llm, user, grants, ai] =
      await Promise.all([
      api<ProjectDetails>(`/projects/${params.id}`),
      api<SemanticResult>(`/projects/${params.id}/semantic`).catch(() => null),
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
    setSemantic(sem);
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
    if (camp?.draft) {
      setDraftName(camp.draft.structureJson.campaign.name);
      setDraftBudget(String(camp.draft.structureJson.campaign.budget_daily));
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
      setLoadError(message || "Не удалось загрузить проект");
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
    if (!current) return;
    const structure = {
      ...current.structureJson,
      campaign: {
        ...current.structureJson.campaign,
        name: draftName.trim() || current.structureJson.campaign.name,
        budget_daily: Number(draftBudget) || current.structureJson.campaign.budget_daily,
      },
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
    setError(null);
    setPending(true);
    try {
      const data = await api<ReportResult>(
        `/projects/${params.id}/reports/collect`,
        { method: "POST" },
      );
      setReport(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось обновить статистику",
      );
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
        <ErrorState message={loadError} onRetry={() => void load()} />
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
  const brief = project.brief;
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
      {oauthFlag === "error" ? (
        <Alert tone="danger" className="mb-4">
          Не удалось подключить {platformTitle(project.primaryPlatform)}.
          Проверьте OAuth-настройки.
        </Alert>
      ) : null}

      <Card>
        <CardTitle>Пайплайн</CardTitle>
        <CardHint>
          Код ведёт проект по стадиям через очередь задач (по одному job на
          project_id, с ретраями). LLM не выбирает следующий шаг. Запуск
          кампании в кабинет оркестратор не ставит в очередь.
        </CardHint>
        <ol className="mb-3 flex flex-wrap gap-2 text-xs">
          {PIPELINE_TRACK.map((item) => {
            const current = pipeline?.stage ?? "idle";
            const reached =
              current === item.id ||
              (item.id === "brief_submitted" &&
                pipeline?.facts.hasBrief) ||
              (item.id === "semantic_ready" &&
                pipeline?.facts.hasSemantic) ||
              (item.id === "copy_ready" && pipeline?.facts.hasCreatives) ||
              (item.id === "awaiting_approval" && pipeline?.facts.hasDraft) ||
              (item.id === "launched" && pipeline?.facts.hasLiveCampaign);
            return (
              <li key={item.id}>
                <span
                  className={
                    reached
                      ? "inline-flex rounded-full bg-[var(--accent)] px-3 py-1 text-[var(--accent-fg)]"
                      : "inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-[var(--fg-muted)]"
                  }
                >
                  {item.label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Стадия: {pipeline?.stage ?? "—"}
          {pipeline?.queue
            ? ` · очередь ${pipeline.queue.mode}/${pipeline.queue.status}`
            : ""}
          {pipeline?.queue?.failedReason
            ? ` · ${pipeline.queue.failedReason}`
            : ""}
          {pipeline?.blockedReason ? ` · ${pipeline.blockedReason}` : ""}
        </p>
        <Button
          onClick={runPipeline}
          disabled={
            pending ||
            readOnly ||
            !aiReady ||
            !pipeline?.autoRunnable ||
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
      </Card>

      <Card>
        <CardTitle>Подключение кабинета</CardTitle>
        <p className="text-sm text-[var(--fg-muted)]">
          {connected
            ? `Подключено · ${project.connection.externalAccountId ?? "аккаунт"}`
            : "Кабинет не подключён"}
          {connected && project.connection.expiresAt
            ? ` · до ${new Date(project.connection.expiresAt).toLocaleString("ru-RU")}`
            : ""}
        </p>
        {error ? (
          <Alert tone="danger" className="mt-2">
            {error}
          </Alert>
        ) : null}
        <div className="mt-3 flex gap-2">
          {!connected ? (
            <Button
              onClick={connectPlatform}
              disabled={pending || readOnly}
            >
              Подключить {platformTitle(project.primaryPlatform)}
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
      </Card>

      {tab === "audit" ? (
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Журнал записей в кабинет</h2>
        <p className="mb-3 text-sm text-zinc-600">
          Кто и когда менял кампании в Директе или Google Ads. Токены не
          сохраняются.
        </p>
        {auditLog && auditLog.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr className="text-zinc-500">
                  <th className="py-1 pr-2">Когда</th>
                  <th className="py-1 pr-2">Кто</th>
                  <th className="py-1 pr-2">Действие</th>
                  <th className="py-1 pr-2">Статус</th>
                  <th className="py-1">Детали</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.items.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 align-top">
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
                    <td className="py-2 text-xs text-zinc-600">
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
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Расходы LLM</h2>
        <p className="mb-3 text-sm text-zinc-600">
          Вызовы моделей по этому проекту. Полный промпт в UI не показывается,
          токены и ключи вырезаются.
        </p>
        {llmUsage && llmUsage.summary.calls > 0 ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded border border-zinc-100 p-2">
                <p className="text-xs text-zinc-500">Вызовы</p>
                <p className="font-medium">{llmUsage.summary.calls}</p>
              </div>
              <div className="rounded border border-zinc-100 p-2">
                <p className="text-xs text-zinc-500">Стоимость</p>
                <p className="font-medium">
                  ${llmUsage.summary.costUsd.toFixed(4)}
                </p>
              </div>
              <div className="rounded border border-zinc-100 p-2">
                <p className="text-xs text-zinc-500">Вход</p>
                <p className="font-medium">{llmUsage.summary.inputTokens}</p>
              </div>
              <div className="rounded border border-zinc-100 p-2">
                <p className="text-xs text-zinc-500">Выход</p>
                <p className="font-medium">{llmUsage.summary.outputTokens}</p>
              </div>
            </div>
            {llmUsage.summary.byAgent.length > 0 ? (
              <ul className="mb-4 text-sm text-zinc-600">
                {llmUsage.summary.byAgent.map((row) => (
                  <li key={row.agentType}>
                    {LLM_AGENT[row.agentType] ?? row.agentType}: {row.calls} · $
                    {row.costUsd.toFixed(4)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="overflow-x-auto">
              <table className="ui-table">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="py-1 pr-2">Когда</th>
                    <th className="py-1 pr-2">Агент</th>
                    <th className="py-1 pr-2">Модель</th>
                    <th className="py-1 pr-2">$</th>
                    <th className="py-1">Превью</th>
                  </tr>
                </thead>
                <tbody>
                  {llmUsage.recent.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-100 align-top">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 pr-2">
                        {LLM_AGENT[row.agentType] ?? row.agentType}
                        <span className="block text-xs text-zinc-400">
                          {row.step}
                        </span>
                      </td>
                      <td className="py-2 pr-2">{row.model}</td>
                      <td className="py-2 pr-2">${row.costUsd.toFixed(4)}</td>
                      <td className="py-2 text-xs text-zinc-600">
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
      </section>
      ) : null}

      {tab === "brief" && me?.canWrite ? (
        <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
          <h2 className="mb-2 font-medium">Доступ к проекту</h2>
          {me.role === "owner" ? (
            <>
              <h3 className="mb-1 text-sm font-medium">Контекстолог агентства</h3>
              <p className="mb-3 text-sm text-zinc-600">
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
          <p className="mb-3 text-sm text-zinc-600">
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
                  className="flex items-center justify-between gap-2 border-t border-zinc-100 py-1"
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
            <p className="text-sm text-zinc-500">Пока никого не приглашали</p>
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
      />
      ) : null}

      {tab === "recs" || tab === "autopilot" ? (
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Рекомендации</h2>
        {tab === "autopilot" ? (
          <h3 className="mb-2 text-sm font-semibold">Автопилот</h3>
        ) : null}
        <p className="mb-3 text-sm text-zinc-600">
          {optimization?.autopilot
            ? "Автопилот включён для этого проекта: пауза, урезание бюджета и минус-слова уходят в кабинет без второго клика. Новые кампании автопилот не публикует."
            : "Автопилот выключен. Агент только предлагает действия по цифрам статистики; в кабинет они попадают после «Принять» и «Применить»."}
          {optimization?.task
            ? ` Задача: ${optimization.task.status}${optimization.task.error ? ` · ${optimization.task.error}` : ""}`
            : ""}
        </p>
        {optimization?.eligibility ? (
          <div className="mb-3 rounded border border-zinc-100 p-3 text-sm">
            <p className="text-xs text-zinc-500">
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
              <ul className="mt-1 list-disc pl-5 text-zinc-600">
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
        <button
          className={btnClass("primary", "mb-4")}
          onClick={runOptimization}
          disabled={pending || readOnly || !aiReady}
        >
          {pending ? "Считаем…" : "Построить рекомендации"}
        </button>
        {optimization && optimization.recommendations.length > 0 ? (
          <ul className="flex flex-col gap-3 text-sm">
            {optimization.recommendations.map((item) => (
              <li
                key={item.id}
                className="rounded border border-zinc-100 p-3"
              >
                <p className="text-xs text-zinc-500">
                  {item.type} · {item.status}
                  {item.appliedBy ? ` · ${item.appliedBy}` : ""} · кампания{" "}
                  {item.campaignExternalId}
                </p>
                <p className="mt-1">{item.rationale}</p>
                {item.error ? (
                  <p className="mt-1 text-red-700">{item.error}</p>
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
          <EmptyState title="Сначала обновите статистику в «Аналитике»">
            Рекомендации строятся по снимкам кабинета. Откройте вкладку
            «Аналитика», нажмите «Обновить статистику», затем вернитесь и
            нажмите «Построить рекомендации».
          </EmptyState>
        )}
      </section>
      ) : null}

      {tab === "semantic" ? (
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">
          <TermHint term="cluster">Семантическое ядро</TermHint>
        </h2>
        <BeginnerNote term="cluster" className="mb-3" />
        <p className="mb-3 text-sm text-zinc-600">
          {semantic?.task
            ? `Задача: ${semantic.task.status}${semantic.task.error ? ` · ${semantic.task.error}` : ""}`
            : "Ещё не запускалось"}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={btnClass("primary")}
            onClick={runSemantic}
            disabled={pending || readOnly || !brief || !aiReady}
          >
            {pending ? "Собираем…" : "Собрать семантику"}
          </button>
          <button
            className={btnClass("secondary")}
            onClick={() =>
              downloadAuthenticated(
                `/projects/${params.id}/semantic/export?format=csv`,
                "semantic.csv",
              )
            }
          >
            CSV
          </button>
          <button
            className={btnClass("secondary")}
            onClick={() =>
              downloadAuthenticated(
                `/projects/${params.id}/semantic/export?format=xlsx`,
                "semantic.xls",
              )
            }
          >
            XLSX
          </button>
        </div>
        {semantic && semantic.clusters.length > 0 ? (
          <div className="flex flex-col gap-4">
            {semantic.clusters.map((cluster) => (
              <div key={cluster.id} className="overflow-x-auto">
                <p className="mb-1 font-medium">
                  <TermHint term="cluster">{cluster.name}</TermHint>{" "}
                  <span className="text-sm font-normal text-zinc-500">
                    {cluster.category}
                  </span>
                </p>
                <table className="ui-table">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="py-1 pr-2">Фраза</th>
                      <th className="py-1 pr-2">
                        <TermHint term="intent">Интент</TermHint>
                      </th>
                      <th className="py-1 pr-2">Почему</th>
                      <th className="py-1">Частота</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cluster.keywords.map((kw) => (
                      <tr key={kw.phrase} className="border-t border-zinc-100">
                        <td className="py-1 pr-2">{kw.phrase}</td>
                        <td className="py-1 pr-2">
                          <TermHint
                            term={
                              kw.intent === "hot"
                                ? "intent_hot"
                                : kw.intent === "warm"
                                  ? "intent_warm"
                                  : kw.intent === "navigational"
                                    ? "intent_navigational"
                                    : "intent"
                            }
                          >
                            {kw.intent}
                          </TermHint>
                        </td>
                        <td className="py-1 pr-2 text-xs text-zinc-500">
                          {keywordWhy(kw)}
                        </td>
                        <td className="py-1">{kw.frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cluster.negativeKeywords.length > 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    <TermHint term="cross_minus">Минуса (кросс-минусация)</TermHint>
                    : {cluster.negativeKeywords.slice(0, 8).join(", ")}
                    {cluster.negativeKeywords.length > 8 ? "…" : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Заполните бриф и нажмите «Собрать семантику»">
            Кластеры появятся после сбора ядра. Если бриф уже есть — кнопка
            «Собрать семантику» выше или «Прогнать пайплайн до черновика» в
            шапке проекта.
          </EmptyState>
        )}
      </section>
      ) : null}

      {tab === "ads" ? (
      <>
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Объявления</h2>
        <p className="mb-3 text-sm text-zinc-600">
          {creatives?.task
            ? `Копирайтинг: ${creatives.task.status}${creatives.task.error ? ` · ${creatives.task.error}` : ""}`
            : "Ещё не запускалось"}
          {creatives?.validationTask
            ? ` · Валидация: ${creatives.validationTask.status}`
            : ""}
          {creatives?.quality
            ? ` · принято без правок: объявления ${formatShare(creatives.quality.creatives.acceptedShare)}, кластеры ${formatShare(creatives.quality.clusters.acceptedShare)}`
            : ""}
        </p>
        <button
          className={btnClass("primary", "mb-4")}
          onClick={runCopy}
          disabled={
            pending || readOnly || !brief || !semantic || semantic.clusters.length === 0 || !aiReady
          }
        >
          {pending ? "Пишем объявления…" : "Сгенерировать объявления"}
        </button>
        {creatives && creatives.issues.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-1 text-sm">
            {creatives.issues.map((issue) => (
              <li key={issue.id}>
                <IssueBadge
                  level={issue.level}
                  autoFixed={issue.autoFixed}
                />{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        {creatives && creatives.creatives.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr className="text-zinc-500">
                  <th className="py-1 pr-2">
                    <TermHint term="cluster">Кластер</TermHint>
                  </th>
                  <th className="py-1 pr-2">A/B</th>
                  <th className="py-1 pr-2">Тип</th>
                  <th className="py-1 pr-2">Текст</th>
                  <th className="py-1 pr-2">Почему</th>
                  <th className="py-1">Issues</th>
                </tr>
              </thead>
              <tbody>
                {creatives.creatives.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 align-top">
                    <td className="py-2 pr-2">{row.clusterName}</td>
                    <td className="py-2 pr-2">{row.abGroup}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {TYPE_LABEL[row.type] ?? row.type}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="ui-input"
                        value={drafts[row.id] ?? row.text}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: event.target.value,
                          }))
                        }
                        onBlur={() => saveCreative(row.id)}
                      />
                    </td>
                    <td className="py-2 pr-2 text-xs text-zinc-500">
                      сгенерировано по кластеру «{row.clusterName}»
                      {row.status === "edited" ? (
                        <Badge kind="alert">правлен вручную</Badge>
                      ) : null}
                    </td>
                    <td className="py-2">
                      {row.issues.length === 0 ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {row.issues.map((issue) => (
                            <IssueBadge
                              key={issue.id}
                              level={issue.level}
                              autoFixed={issue.autoFixed}
                              title={issue.message}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Сначала соберите семантику на вкладке «Семантика»">
            Без кластеров тексты писать не из чего. Нажмите «Собрать семантику»,
            затем вернитесь и нажмите «Сгенерировать объявления».
          </EmptyState>
        )}
      </section>

      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Визуальные креативы</h2>
        <p className="mb-3 text-sm text-zinc-600">
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
                className="rounded border border-zinc-100 p-3 text-sm"
              >
                <MediaPreview
                  projectId={params.id}
                  assetId={item.id}
                  kind={item.kind}
                  mimeType={item.mimeType}
                />
                <p className="mt-2 text-xs text-zinc-500">
                  {item.kind === "video" ? "Видео" : "Изображение"}
                  {item.durationMs ? ` · ${Math.round(item.durationMs / 1000)} с` : ""}
                  {" · "}
                  {item.status} · {item.provider}
                  {item.clusterName ? ` · ${item.clusterName}` : ""}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-zinc-600">
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
            На вкладке «Семантика» нажмите «Собрать семантику», вернитесь сюда и
            нажмите «Сгенерировать изображения». В рекламный кабинет файлы не
            уходят.
          </EmptyState>
        )}
      </section>
      </>
      ) : null}

      {tab === "campaign" ? (
      <section className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-2 font-medium">Кампания</h2>
        <p className="mb-3 text-sm text-zinc-600">
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
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              Название
              <input
                className="ui-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveDraftMeta}
              />
            </label>
            <label className="flex flex-col gap-1">
              Бюджет в день ({campaigns.draft.structureJson.campaign.currency})
              <input
                className="ui-input"
                value={draftBudget}
                onChange={(event) => setDraftBudget(event.target.value)}
                onBlur={saveDraftMeta}
              />
            </label>
            <p>
              Гео: {campaigns.draft.structureJson.campaign.geo.join(", ")} ·
              сайт: {campaigns.draft.structureJson.campaign.href} · статус в
              кабинете:{" "}
              {campaigns.draft.structureJson.campaign.initial_status}
            </p>
            {campaigns.draft.structureJson.ad_groups.map((group) => (
              <div key={group.name} className="rounded border border-zinc-100 p-2">
                <p className="font-medium">{group.name}</p>
                <p className="text-xs text-zinc-500">
                  Ключи: {group.keywords.slice(0, 8).join(", ")}
                  {group.keywords.length > 8 ? "…" : ""}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {group.ads.map((ad) => (
                    <li key={`${group.name}-${ad.ab_group}`}>
                      [{ad.ab_group}] {ad.headline1} / {ad.headline2} —{" "}
                      {ad.description}
                      <span className="ml-1 text-xs text-zinc-500">
                        · сгенерировано по кластеру «{group.name}»
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {campaigns.draft.structureJson.publish?.error ? (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800">
                Сбой на шаге {campaigns.draft.structureJson.publish.step}:{" "}
                {campaigns.draft.structureJson.publish.error}
              </p>
            ) : null}
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
              <p className="text-xs text-zinc-500">
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
          <ul className="mt-4 text-sm">
            {campaigns.campaigns.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                ID в кабинете: {item.externalCampaignId} · {item.status}
                <StatusBadge value={item.status} map="campaign" />
                {item.budget != null ? ` · бюджет ${item.budget}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      ) : null}

      {tab === "brief" ? (
      <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <h2 className="mb-3 font-medium">Бриф</h2>
        {brief ? (
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-zinc-500">Сайт</dt>
              <dd>{brief.project.website_url}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Гео</dt>
              <dd>{brief.project.geo.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Бюджет</dt>
              <dd>
                {brief.project.budget.daily} {brief.project.budget.currency} /
                день
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">УТП</dt>
              <dd>
                <ul className="list-disc pl-5">
                  {brief.marketing.usp.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Аудитория</dt>
              <dd>
                {brief.marketing.target_audience
                  .map((item) => item.segment)
                  .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Минус-слова</dt>
              <dd>
                {brief.exclusions.global_negative_keywords.length > 0
                  ? brief.exclusions.global_negative_keywords.join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <EmptyState title="Создайте проект через мастер «Новый проект + бриф»">
            Откройте портфель, пройдите шаги «О продукте» → «Аудитория и УТП» →
            «Бюджет и гео» → «Подключить кабинет». Сайт, гео и УТП появятся
            здесь.
          </EmptyState>
        )}
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
