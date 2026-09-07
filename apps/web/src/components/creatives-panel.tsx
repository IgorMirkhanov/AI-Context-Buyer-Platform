"use client";

import { useMemo, useState } from "react";
import { Badge, IssueBadge } from "@/ui/badge";
import { btnClass } from "@/ui/button";
import { EmptyState } from "@/ui/states";

export type CreativeIssue = {
  id: string;
  level: "critical" | "warning";
  code: string;
  message: string;
  autoFixed: boolean;
};

export type CreativeRow = {
  id: string;
  clusterName: string;
  type: string;
  text: string;
  abGroup: string;
  status: string;
  issues: CreativeIssue[];
};

export type CreativesPanelData = {
  task: { status: string; error: string | null } | null;
  validationTask: { status: string; error: string | null } | null;
  quality?: {
    creatives: { total: number; edited: number; acceptedShare: number | null };
    clusters: { total: number; edited: number; acceptedShare: number | null };
  };
  creatives: CreativeRow[];
  issues: Array<CreativeIssue & { creativeId: string | null }>;
};

const TYPE_LABEL: Record<string, string> = {
  headline1: "Заголовок 1",
  headline2: "Заголовок 2",
  description: "Описание",
  sitelink: "Быстрая ссылка",
  callout: "Уточнение",
};

const TYPE_ORDER: Record<string, number> = {
  headline1: 0,
  headline2: 1,
  description: 2,
  sitelink: 3,
  callout: 4,
};

type AdUnit = {
  key: string;
  clusterName: string;
  abGroup: string;
  parts: CreativeRow[];
  issueCount: number;
  criticalCount: number;
  score: number;
};

function humanizeIssue(message: string): string {
  const crossMinus = message.match(
    /^Missing minus "(.+)" from "(.+)"$/,
  );
  if (crossMinus) {
    return `В минус-слова кластера «${crossMinus[2]}» не добавлено «${crossMinus[1]}»`;
  }
  return message;
}

function scoreAdUnit(parts: CreativeRow[]): number {
  let score = 0;
  for (const part of parts) {
    const weight = { headline1: 12, headline2: 8, description: 6, sitelink: 2, callout: 1 }[
      part.type
    ] ?? 0;
    score += weight;
    if (part.status === "accepted") score += 1;
    for (const issue of part.issues) {
      score -= issue.level === "critical" ? 25 : 4;
    }
  }
  const hasHeadline = parts.some((p) => p.type === "headline1");
  const hasDescription = parts.some((p) => p.type === "description");
  if (hasHeadline && hasDescription) score += 5;
  return score;
}

function buildAdUnits(creatives: CreativeRow[]): AdUnit[] {
  const map = new Map<string, CreativeRow[]>();
  for (const row of creatives) {
    const key = `${row.clusterName}::${row.abGroup}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, parts]) => {
      const sorted = [...parts].sort(
        (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9),
      );
      const issueCount = sorted.reduce((n, p) => n + p.issues.length, 0);
      const criticalCount = sorted.reduce(
        (n, p) => n + p.issues.filter((i) => i.level === "critical").length,
        0,
      );
      const [clusterName, abGroup] = key.split("::");
      return {
        key,
        clusterName,
        abGroup,
        parts: sorted,
        issueCount,
        criticalCount,
        score: scoreAdUnit(sorted),
      };
    })
    .sort((a, b) => b.score - a.score || a.issueCount - b.issueCount);
}

function groupIssues(
  issues: Array<CreativeIssue & { creativeId?: string | null }>,
): Array<{
  key: string;
  level: "critical" | "warning";
  code: string;
  message: string;
  count: number;
}> {
  const map = new Map<
    string,
    { level: "critical" | "warning"; code: string; message: string; count: number }
  >();
  for (const issue of issues) {
    const message = humanizeIssue(issue.message);
    const key = `${issue.code}::${message}`;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else {
      map.set(key, {
        level: issue.level,
        code: issue.code,
        message,
        count: 1,
      });
    }
  }
  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => {
    if (a.level !== b.level) return a.level === "critical" ? -1 : 1;
    return b.count - a.count;
  });
}

function formatShare(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function AdUnitCard({
  unit,
  rank,
  drafts,
  onDraftChange,
  onSave,
  compact,
}: {
  unit: AdUnit;
  rank?: number;
  drafts: Record<string, string>;
  onDraftChange: (id: string, text: string) => void;
  onSave: (id: string) => void;
  compact?: boolean;
}) {
  const headline = unit.parts.find((p) => p.type === "headline1");
  const headline2 = unit.parts.find((p) => p.type === "headline2");
  const description = unit.parts.find((p) => p.type === "description");
  const extras = unit.parts.filter(
    (p) => !["headline1", "headline2", "description"].includes(p.type),
  );

  return (
    <article
      className={`ui-panel relative p-4 ${
        unit.criticalCount > 0
          ? "border-[var(--status-danger-border)]"
          : unit.issueCount > 0
            ? "border-[var(--status-alert-border)]"
            : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {rank != null ? (
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-high)] px-2 py-0.5 text-xs font-medium text-[var(--fg)]">
            #{rank}
          </span>
        ) : null}
        <span className="text-sm font-medium">{unit.clusterName}</span>
        <Badge kind="draft">вариант {unit.abGroup}</Badge>
        {unit.issueCount === 0 ? (
          <Badge kind="success">без замечаний</Badge>
        ) : (
          <Badge kind={unit.criticalCount > 0 ? "alert" : "alert"}>
            {unit.issueCount} замеч.
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {[headline, headline2, description].filter(Boolean).map((part) => (
          <label key={part!.id} className="flex flex-col gap-0.5">
            <span className="text-xs text-[var(--fg-muted)]">
              {TYPE_LABEL[part!.type] ?? part!.type}
            </span>
            {compact ? (
              <span className="font-medium">{drafts[part!.id] ?? part!.text}</span>
            ) : (
              <input
                className="ui-input"
                value={drafts[part!.id] ?? part!.text}
                onChange={(event) => onDraftChange(part!.id, event.target.value)}
                onBlur={() => onSave(part!.id)}
              />
            )}
          </label>
        ))}
        {extras.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1 text-xs text-[var(--fg-muted)]">
            {extras.map((part) => (
              <li key={part.id}>
                <span className="text-[var(--fg-faint)]">{TYPE_LABEL[part.type] ?? part.type}:</span>{" "}
                {drafts[part.id] ?? part.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function CreativesPanel({
  data,
  drafts,
  onDraftChange,
  onSave,
  onGenerate,
  generateDisabled,
  generatePending,
  generateLabel,
}: {
  data: CreativesPanelData | null;
  drafts: Record<string, string>;
  onDraftChange: (id: string, text: string) => void;
  onSave: (id: string) => void;
  onGenerate: () => void;
  generateDisabled: boolean;
  generatePending: boolean;
  generateLabel: string;
}) {
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [showAllTable, setShowAllTable] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  const adUnits = useMemo(
    () => (data ? buildAdUnits(data.creatives) : []),
    [data],
  );
  const topUnits = adUnits.slice(0, 5);
  const issueGroups = useMemo(
    () => (data ? groupIssues(data.issues) : []),
    [data],
  );
  const clusters = useMemo(() => {
    const names = new Set(adUnits.map((u) => u.clusterName));
    return [...names].sort((a, b) => a.localeCompare(b, "ru"));
  }, [adUnits]);

  const cleanUnits = adUnits.filter((u) => u.issueCount === 0).length;
  const criticalIssues = issueGroups.filter((g) => g.level === "critical").length;

  return (
    <section className="ui-panel relative mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Варианты объявлений</h2>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            {data?.task
              ? `Копирайтинг: ${data.task.status}${data.task.error ? ` · ${data.task.error}` : ""}`
              : "Ещё не запускалось"}
            {data?.validationTask
              ? ` · Валидация: ${data.validationTask.status}`
              : ""}
          </p>
        </div>
        <button
          className={btnClass("primary")}
          onClick={onGenerate}
          disabled={generateDisabled}
        >
          {generatePending ? "Пишем объявления…" : generateLabel}
        </button>
      </div>

      {data && data.creatives.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="ui-kpi">
            <p className="text-[11px] text-[var(--outline)]">Кластеров</p>
            <p className="font-mono text-xl font-semibold">{clusters.length}</p>
          </div>
          <div className="ui-kpi">
            <p className="text-[11px] text-[var(--outline)]">Вариантов A/B</p>
            <p className="font-mono text-xl font-semibold">{adUnits.length}</p>
          </div>
          <div className="ui-kpi">
            <p className="text-[11px] text-[var(--outline)]">Без замечаний</p>
            <p className="font-mono text-xl font-semibold text-[var(--secondary)]">{cleanUnits}</p>
          </div>
          <div className="ui-kpi">
            <p className="text-[11px] text-[var(--outline)]">Типов замечаний</p>
            <p className="font-mono text-xl font-semibold">
              {issueGroups.length}
              {criticalIssues > 0 ? ` · ${criticalIssues} крит.` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {!data || data.creatives.length === 0 ? (
        <EmptyState title="Сначала соберите семантику на вкладке «Семантика · План»">
          Без кластеров тексты писать не из чего. Откройте «Семантика · План»,
          нажмите «Собрать семантику», затем вернитесь и нажмите
          «Сгенерировать объявления».
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {topUnits.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Топ‑5 лучших вариантов</h3>
              <p className="mb-3 text-xs text-[var(--fg-muted)]">
                Ранжирование по полноте объявления и количеству замечаний валидации.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {topUnits.map((unit, index) => (
                  <AdUnitCard
                    key={unit.key}
                    unit={unit}
                    rank={index + 1}
                    drafts={drafts}
                    onDraftChange={onDraftChange}
                    onSave={onSave}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {clusters.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">По кластерам</h3>
              <div className="flex flex-col gap-2">
                {clusters.map((clusterName) => {
                  const units = adUnits.filter((u) => u.clusterName === clusterName);
                  const best = units[0];
                  const open = expandedCluster === clusterName;
                  return (
                    <div
                      key={clusterName}
                      className="rounded border border-[var(--border)]"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-mid)]"
                        onClick={() =>
                          setExpandedCluster(open ? null : clusterName)
                        }
                      >
                        <span className="font-medium">{clusterName}</span>
                        <span className="text-xs text-[var(--fg-muted)]">
                          {units.length} вар. · лучший: {best?.abGroup ?? "—"}
                          {best && best.issueCount === 0 ? " · ок" : ""}
                        </span>
                      </button>
                      {open ? (
                        <div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2">
                          {units.map((unit) => (
                            <AdUnitCard
                              key={unit.key}
                              unit={unit}
                              drafts={drafts}
                              onDraftChange={onDraftChange}
                              onSave={onSave}
                              compact
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {issueGroups.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Замечания валидации</h3>
                <button
                  type="button"
                  className="text-xs text-[var(--fg-muted)] underline"
                  onClick={() => setShowAllIssues((v) => !v)}
                >
                  {showAllIssues
                    ? "Свернуть"
                    : `Показать все (${issueGroups.length})`}
                </button>
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {(showAllIssues ? issueGroups : issueGroups.slice(0, 5)).map(
                  (group) => (
                    <li
                      key={group.key}
                      className="flex flex-wrap items-start gap-2 rounded border border-[var(--border)] px-2 py-1.5"
                    >
                      <IssueBadge level={group.level} autoFixed={false} />
                      <span className="flex-1">{group.message}</span>
                      {group.count > 1 ? (
                        <Badge kind="draft">×{group.count}</Badge>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
              {!showAllIssues && issueGroups.length > 5 ? (
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  Ещё {issueGroups.length - 5} типов замечаний — нажмите «Показать все».
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Валидация прошла без замечаний.</p>
          )}

          <div>
            <button
              type="button"
              className={btnClass("secondary", "mb-2")}
              onClick={() => setShowAllTable((v) => !v)}
            >
              {showAllTable ? "Скрыть таблицу всех текстов" : "Все тексты (таблица)"}
            </button>
            {showAllTable ? (
              <div className="overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr className="text-[var(--fg-muted)]">
                      <th className="py-1 pr-2">Кластер</th>
                      <th className="py-1 pr-2">A/B</th>
                      <th className="py-1 pr-2">Тип</th>
                      <th className="py-1 pr-2">Текст</th>
                      <th className="py-1">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.creatives.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-[var(--border)] align-top"
                      >
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
                              onDraftChange(row.id, event.target.value)
                            }
                            onBlur={() => onSave(row.id)}
                          />
                        </td>
                        <td className="py-2">
                          {row.issues.length === 0 ? (
                            <span className="text-[var(--fg-faint)]">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {row.issues.map((issue) => (
                                <IssueBadge
                                  key={issue.id}
                                  level={issue.level}
                                  autoFixed={issue.autoFixed}
                                  title={humanizeIssue(issue.message)}
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
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
