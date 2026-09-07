"use client";

import Link from "next/link";
import { formatDateTimeRu } from "@/lib/format-datetime";
import { Alert } from "@/ui/alert";

export function OptimizationScheduleBanner({
  projectId,
  launchedAt,
  lastRunAt,
  nextRunAt,
  hasPublishedCampaigns,
}: {
  projectId: string;
  launchedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  hasPublishedCampaigns: boolean;
}) {
  if (!hasPublishedCampaigns) {
    return (
      <Alert tone="info" className="mb-4" title="Рекомендации после запуска">
        После публикации кампании агент автоматически проверит статистику: в
        день запуска, через 7 дней и далее каждую неделю. Снимки берутся из
        кабинета — сначала обновите статистику на вкладке{" "}
        <Link href={`/projects/${projectId}?tab=analytics`} className="underline">
          «Аналитика»
        </Link>
        .
      </Alert>
    );
  }

  const nextMs = nextRunAt ? new Date(nextRunAt).getTime() : null;
  const isDue = nextMs != null && nextMs <= Date.now();

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-3 text-sm">
      <p className="mb-1 font-medium">Автоматические прогоны оптимизации</p>
      <p className="mb-2 text-xs text-[var(--fg-muted)]">
        Фоновая очередь: день 0 после публикации → 7-й день → далее каждые 7
        дней. Кнопка ниже — внеплановый прогон без сдвига расписания.
      </p>
      <dl className="grid gap-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[var(--fg-muted)]">Запуск в кабинете</dt>
          <dd>{formatDateTimeRu(launchedAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Последний прогон</dt>
          <dd>{formatDateTimeRu(lastRunAt)}</dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Следующий прогон</dt>
          <dd className={isDue ? "font-medium text-[var(--status-alert-fg)]" : ""}>
            {formatDateTimeRu(nextRunAt)}
            {isDue ? " · ожидается в ближайшие часы" : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}
