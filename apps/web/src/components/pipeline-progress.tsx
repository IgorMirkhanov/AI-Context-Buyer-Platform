import Link from "next/link";
import type { ProjectTabId } from "@/shell/project-tabs";

export type PipelineFacts = {
  hasBrief: boolean;
  hasAnalysis: boolean;
  hasSemantic: boolean;
  hasPlan: boolean;
  planApproved: boolean;
  hasCreatives: boolean;
  hasDraft: boolean;
  hasLiveCampaign: boolean;
};

export type PipelineProgressData = {
  stage: string;
  blockedReason: string | null;
  autoRunnable: boolean;
  fullRunAvailable: boolean;
  canCancel?: boolean;
  queue?: {
    status: string;
  };
  facts: PipelineFacts;
};

type TrackStep = {
  id: string;
  label: string;
  tab: ProjectTabId;
};

const PIPELINE_TRACK: TrackStep[] = [
  { id: "brief", label: "Бриф", tab: "brief" },
  { id: "analysis", label: "Анализ", tab: "analysis" },
  { id: "plan", label: "Семантика", tab: "plan" },
  { id: "ads", label: "Объявления", tab: "ads" },
  { id: "draft", label: "Черновик", tab: "campaign" },
  { id: "launch", label: "Запуск", tab: "campaign" },
];

const HUMAN_GATE_STAGES = new Set([
  "analysis_ready",
  "plan_ready",
  "awaiting_approval",
]);

const STAGE_LABELS: Record<string, string> = {
  idle: "Ожидание брифа",
  brief_submitted: "Бриф принят",
  analysis_in_progress: "Анализ выполняется",
  analysis_ready: "Анализ готов — откройте «План»",
  semantic_in_progress: "Собираем семантику для плана",
  semantic_ready: "Семантика готова — проверьте «План»",
  plan_in_progress: "Формируем структуру кампаний",
  plan_ready: "План готов — подтвердите «Ок, собирай»",
  copywriting_in_progress: "Пишем объявления",
  validation_in_progress: "Проверка объявлений",
  copy_ready: "Объявления готовы",
  draft_ready: "Сборка черновика",
  awaiting_approval: "Черновик готов — проверьте и опубликуйте",
  launched: "Кампания в кабинете",
  live_optimizing: "Сбор статистики и оптимизация",
  failed: "Ошибка на последнем шаге",
};

type StepStatus = "done" | "running" | "waiting" | "next" | "upcoming";

function stageTrackIndex(stage: string): number {
  const map: Record<string, number> = {
    idle: 0,
    brief_submitted: 0,
    analysis_in_progress: 1,
    analysis_ready: 1,
    semantic_in_progress: 2,
    semantic_ready: 2,
    plan_in_progress: 2,
    plan_ready: 2,
    copywriting_in_progress: 3,
    validation_in_progress: 3,
    copy_ready: 3,
    draft_ready: 4,
    awaiting_approval: 4,
    launched: 5,
    live_optimizing: 5,
    failed: -1,
  };
  return map[stage] ?? 0;
}

function milestoneDone(facts: PipelineFacts, index: number): boolean {
  switch (index) {
    case 0:
      return facts.hasBrief;
    case 1:
      return facts.hasAnalysis;
    case 2:
      return facts.hasSemantic && facts.hasPlan && facts.planApproved;
    case 3:
      return facts.hasCreatives;
    case 4:
      return facts.hasDraft;
    case 5:
      return facts.hasLiveCampaign;
    default:
      return false;
  }
}

function resolveStepStatus(
  index: number,
  pipeline: PipelineProgressData,
): StepStatus {
  const { stage, facts, queue } = pipeline;
  const trackIndex = stageTrackIndex(stage);
  const queueBusy =
    queue?.status === "queued" || queue?.status === "active";
  const humanGate = HUMAN_GATE_STAGES.has(stage);
  const fullAuto = pipeline.fullRunAvailable;

  if (stage === "failed") {
    if (index < trackIndex || milestoneDone(facts, index)) return "done";
    if (index === trackIndex) return "waiting";
    return "upcoming";
  }

  if (queueBusy && index === trackIndex) return "running";

  if (humanGate && index === trackIndex && !fullAuto) return "waiting";

  if (milestoneDone(facts, index)) return "done";

  if (
    fullAuto &&
    humanGate &&
    index === trackIndex + 1 &&
    milestoneDone(facts, trackIndex)
  ) {
    return "next";
  }

  if (
    index === trackIndex + 1 &&
    milestoneDone(facts, trackIndex) &&
    pipeline.autoRunnable &&
    !humanGate
  ) {
    return "next";
  }

  if (index === trackIndex) {
    if (stage.endsWith("_in_progress")) return "running";
    return "next";
  }

  if (index > trackIndex) return "upcoming";

  return milestoneDone(facts, index) ? "done" : "upcoming";
}

function stepClass(status: StepStatus): string {
  switch (status) {
    case "done":
      return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
    case "running":
      return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)] ring-1 ring-[var(--accent)]/40";
    case "waiting":
      return "border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] text-[var(--status-alert-fg)] ring-1 ring-amber-400/30";
    case "next":
      return "border-[var(--accent)]/50 bg-[var(--bg-high)] text-[var(--fg)] shadow-[0_0_12px_rgba(128,131,255,0.15)]";
    default:
      return "border-[var(--border)] bg-[var(--bg)]/70 text-[var(--fg-faint)] opacity-80";
  }
}

function stepBadge(status: StepStatus): string | null {
  switch (status) {
    case "done":
      return "✓";
    case "running":
      return "…";
    case "waiting":
      return "!";
    case "next":
      return "→";
    default:
      return null;
  }
}

function nextActionHint(pipeline: PipelineProgressData): string | null {
  if (pipeline.queue?.status === "queued" || pipeline.queue?.status === "active") {
    return "Пайплайн выполняется — дождитесь завершения текущего шага.";
  }

  if (pipeline.fullRunAvailable && pipeline.stage !== "awaiting_approval") {
    return "«Прогнать пайплайн до черновика» пройдёт оставшиеся этапы автоматически. Для одного шага с правками — откройте вкладку этапа.";
  }

  if (pipeline.blockedReason) return pipeline.blockedReason;

  const { stage } = pipeline;
  if (stage === "analysis_ready") {
    return "Вкладка «Анализ» → «Собрать семантику», затем снова «Прогнать пайплайн».";
  }
  if (stage === "plan_ready") {
    return "Вкладка «План» → «Ок, собирай», затем снова «Прогнать пайплайн».";
  }
  if (stage === "awaiting_approval") {
    return "Черновик собран. Проверьте на вкладке «Кампания» или нажмите «Отменить и доработать», чтобы вернуться к правкам.";
  }
  if (stage === "launched" || stage === "live_optimizing") {
    return "Пайплайн завершён. Смотрите «Аналитику» и «Рекомендации».";
  }
  return null;
}

export function PipelineProgress({
  projectId,
  pipeline,
}: {
  projectId: string;
  pipeline: PipelineProgressData | null;
}) {
  if (!pipeline) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">Загрузка статуса пайплайна…</p>
    );
  }

  const stageLabel = STAGE_LABELS[pipeline.stage] ?? pipeline.stage;
  const hint = nextActionHint(pipeline);
  const queueLabel =
    pipeline.queue?.status === "queued" || pipeline.queue?.status === "active"
      ? " · выполняется"
      : pipeline.queue?.status === "completed"
        ? ""
        : "";

  return (
    <div className="ui-panel relative space-y-4 p-3">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_TRACK.map((step, index) => {
          const status = resolveStepStatus(index, pipeline);
          const badge = stepBadge(status);
          const href = `/projects/${projectId}?tab=${step.tab}`;

          return (
            <li key={step.id} className="min-w-0">
              <Link
                href={href}
                className={`flex min-h-[2.75rem] items-center gap-2 rounded border px-2 py-2 text-xs font-medium transition hover:opacity-90 ${stepClass(status)}`}
                title={
                  status === "waiting"
                    ? "Нужно ваше действие на этой вкладке"
                    : status === "running"
                      ? "Шаг выполняется"
                      : undefined
                }
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/20 text-[10px] font-bold">
                  {badge ?? String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] opacity-70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="block truncate">{step.label}</span>
                  {status === "waiting" ? (
                    <span className="mt-0.5 block text-[10px] font-normal opacity-90">
                      ваш ход
                    </span>
                  ) : null}
                  {status === "running" ? (
                    <span className="mt-0.5 block text-[10px] font-normal opacity-90">
                      идёт…
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
        <p className="font-medium text-[var(--fg)]">
          Сейчас: {stageLabel}
          {queueLabel}
        </p>
        {hint ? (
          <p className="mt-1 text-[var(--fg-muted)]">{hint}</p>
        ) : null}
        {pipeline.queue?.status === "failed" ? (
          <p className="mt-1 text-[var(--status-danger-fg)]">
            Ошибка очереди. Обновите страницу или повторите шаг.
          </p>
        ) : null}
      </div>

      <p className="text-xs text-[var(--fg-muted)]">
        <span className="inline-flex flex-wrap items-center gap-3">
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--secondary)]" />{" "}
            готово
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-soft)]" />{" "}
            выполняется
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />{" "}
            ждёт вас
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />{" "}
            следующий шаг
          </span>
        </span>
      </p>
    </div>
  );
}
