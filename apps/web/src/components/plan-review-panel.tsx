"use client";

import { useState } from "react";
import { isKeywordCommercial } from "@/lib/semantic-keywords";
import { btnClass } from "@/ui/button";
import { EmptyState } from "@/ui/states";
import { TermHint, BeginnerNote } from "@/ui/term-hint";

type SemanticKeyword = {
  phrase: string;
  intent: string;
  frequency: number;
  source: string;
  isCommercial?: boolean;
};

type SemanticCluster = {
  id: string;
  name: string;
  category: string;
  keywords: SemanticKeyword[];
};

type NegativeSuggestion = {
  id: string;
  phrase: string;
  reason: string;
  source?: string;
  status: "pending" | "accepted" | "rejected";
};

function negativeSourceBadge(source?: string): string {
  switch (source) {
    case "keyword_planner_noncommercial":
      return "keyword_planner_noncommercial";
    case "llm_niche_antonym":
      return "llm_niche_antonym";
    case "llm_negative_words":
      return "llm_negative_words";
    default:
      return source?.trim() || "llm_negative_words";
  }
}

type CampaignPlan = {
  campaigns: Array<{
    name: string;
    rationale: string;
    ad_groups: Array<{
      name: string;
      cluster_names: string[];
    }>;
  }>;
};

type Props = {
  semantic: {
    clusters: SemanticCluster[];
    negativeSuggestions: NegativeSuggestion[];
  } | null;
  semanticTask?: { status: string; error: string | null } | null;
  briefNegatives: string[];
  campaignPlan: {
    ready: boolean;
    approved: boolean;
    campaignCount: number;
    llmMode: string | null;
    plan: CampaignPlan | null;
    task: { status: string; error: string | null } | null;
  } | null;
  readOnly: boolean;
  pending: boolean;
  aiReady: boolean;
  hasAnalysis: boolean;
  onRunSemantic: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onRunPlan: () => void;
  onApprove: () => void;
  onResolveNegative: (
    suggestionId: string,
    action: "accept" | "reject",
  ) => void;
};

function commercialKeywords(
  clusters: SemanticCluster[],
): Array<SemanticKeyword & { clusterName: string }> {
  const rows: Array<SemanticKeyword & { clusterName: string }> = [];
  for (const cluster of clusters) {
    for (const kw of cluster.keywords) {
      if (!isKeywordCommercial(kw)) continue;
      rows.push({ ...kw, clusterName: cluster.name });
    }
  }
  return rows.sort((a, b) => b.frequency - a.frequency);
}

export function PlanReviewPanel({
  semantic,
  semanticTask,
  briefNegatives,
  campaignPlan,
  readOnly,
  pending,
  aiReady,
  hasAnalysis,
  onRunSemantic,
  onExportCsv,
  onExportXlsx,
  onRunPlan,
  onApprove,
  onResolveNegative,
}: Props) {
  const [showAllPhrases, setShowAllPhrases] = useState(false);

  const hasSemantic = Boolean(semantic && semantic.clusters.length > 0);
  const keywords = semantic ? commercialKeywords(semantic.clusters) : [];
  const suggestions = semantic?.negativeSuggestions ?? [];
  const pendingNegatives = suggestions.filter((item) => item.status === "pending");
  const acceptedSuggestions = suggestions.filter(
    (item) => item.status === "accepted",
  );
  const briefSet = new Set(briefNegatives.map((item) => item.toLowerCase()));
  const extraAccepted = acceptedSuggestions.filter(
    (item) => !briefSet.has(item.phrase.toLowerCase()),
  );
  const allMinusWords = [
    ...briefNegatives,
    ...extraAccepted.map((item) => item.phrase),
  ];

  const planReady = Boolean(campaignPlan?.ready && campaignPlan.plan);
  const planApproved = Boolean(campaignPlan?.approved);

  return (
    <div className="flex flex-col gap-6">
      <BeginnerNote term="cluster" className="mb-0" />
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 px-3 py-2">
        <p className="text-xs font-medium text-[var(--accent-soft)]">
          1. Семантика → 2. Структура кампаний → 3. Утверждение
        </p>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {semanticTask
            ? `Семантика: ${semanticTask.status}${semanticTask.error ? ` · ${semanticTask.error}` : ""}`
            : hasSemantic
              ? `Собрано кластеров: ${semantic?.clusters.length ?? 0}`
              : "Сначала соберите семантику — затем сформируйте структуру и утвердите план."}
          {campaignPlan?.task
            ? ` · план: ${campaignPlan.task.status}${campaignPlan.task.error ? ` · ${campaignPlan.task.error}` : ""}`
            : planReady
              ? ` · структура: ${campaignPlan?.campaignCount ?? 0} кампаний${campaignPlan?.llmMode ? ` · ${campaignPlan.llmMode}` : ""}`
              : ""}
          {planApproved ? " · утверждён" : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnClass(hasSemantic ? "secondary" : "primary")}
          onClick={onRunSemantic}
          disabled={pending || readOnly || !aiReady || !hasAnalysis}
        >
          {pending && !hasSemantic
            ? "Собираем…"
            : hasSemantic
              ? "Пересобрать семантику"
              : "Собрать семантику"}
        </button>
        {hasSemantic ? (
          <>
            <button
              type="button"
              className={btnClass("secondary")}
              onClick={onExportCsv}
              disabled={pending}
            >
              Экспорт CSV
            </button>
            <button
              type="button"
              className={btnClass("secondary")}
              onClick={onExportXlsx}
              disabled={pending}
            >
              Экспорт XLSX
            </button>
            <button
              type="button"
              className={btnClass("secondary")}
              onClick={onRunPlan}
              disabled={pending || readOnly || !aiReady}
            >
              {pending
                ? "Формируем…"
                : planReady
                  ? "Пересформировать структуру"
                  : "Сформировать структуру"}
            </button>
          </>
        ) : null}
      </div>

      {!hasAnalysis ? (
        <EmptyState title="Нужен анализ сайта">
          На вкладке «Анализ» запустите разбор брифа и сайта — без него семантику
          не собрать.
        </EmptyState>
      ) : !hasSemantic ? (
        <EmptyState title="Семантика ещё не собрана">
          Нажмите «Собрать семантику» или прогоните пайплайн до черновика. Здесь
          появятся коммерческие ключи, минус-слова и структура кампаний.
        </EmptyState>
      ) : (
        <>
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-medium">
                <TermHint term="cluster">Семантическое ядро</TermHint>{" "}
                <span className="text-sm font-normal text-[var(--fg-muted)]">
                  · {semantic!.clusters.length} кластер
                  {semantic!.clusters.length === 1 ? "" : "а"} ·{" "}
                  {keywords.length} коммерческих фраз
                </span>
              </h3>
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-[var(--fg-muted)]">
                <input
                  type="checkbox"
                  checked={showAllPhrases}
                  onChange={(event) => setShowAllPhrases(event.target.checked)}
                  className="rounded border-[var(--border-strong)]"
                />
                Показать некоммерческие (обзоры, отзывы)
              </label>
            </div>
            <p className="mb-3 text-sm text-[var(--fg-muted)]">
              Фразы сгруппированы по смыслу (кластеры). В запуск идут только
              коммерческие — покупка, цена, заказ + гео.
            </p>
            {keywords.some((kw) => kw.source === "mock_wordstat") ||
            keywords.every(
              (kw) => kw.frequency === 1200 || kw.frequency === 900,
            ) ? (
              <p className="mb-3 rounded-lg border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] px-3 py-2 text-xs text-[var(--status-alert-fg)]">
                Частоты 900/1200 — из mock Wordstat (пока нет живого Wordstat /
                кабинета). После подключения Директа частоты станут реальными;
                пересоберите семантику.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              {semantic!.clusters.map((cluster) => {
                const rows = showAllPhrases
                  ? cluster.keywords
                  : cluster.keywords.filter((kw) => isKeywordCommercial(kw));
                if (rows.length === 0) return null;
                return (
                  <article
                    key={cluster.id}
                    className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]/40"
                  >
                    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-mid)] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{cluster.name}</p>
                        <p className="font-mono text-[11px] text-[var(--fg-faint)]">
                          {cluster.category} · {rows.length} фраз
                        </p>
                      </div>
                    </header>
                    <div className="max-h-56 overflow-auto">
                      <table className="ui-table w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left">Фраза</th>
                            <th className="text-left">Интент</th>
                            <th className="text-right">Частота</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((kw) => (
                            <tr
                              key={`${cluster.id}:${kw.phrase}`}
                              className={
                                !isKeywordCommercial(kw)
                                  ? "text-[var(--fg-faint)]"
                                  : undefined
                              }
                            >
                              <td>{kw.phrase}</td>
                              <td className="font-mono text-xs">{kw.intent}</td>
                              <td className="text-right font-mono text-xs">
                                {kw.frequency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">Минус-слова</h3>
            <p className="mb-3 text-sm text-[var(--fg-muted)]">
              Из брифа и то, что вы приняли из предложений агента. Перед «Ок,
              собирай» отклоните лишнее (продажа, монтаж, модели, бренды) —
              иначе ожидающие предложения попадут в бриф автоматически.
            </p>
            {allMinusWords.length > 0 ? (
              <p className="mb-2 text-sm">
                <span className="text-[var(--fg-muted)]">Итого: </span>
                {allMinusWords.join(", ")}
              </p>
            ) : (
              <p className="mb-2 text-sm text-[var(--fg-muted)]">
                Глобальные минусы не заданы — агент предложит после сбора
                семантики.
              </p>
            )}
            {pendingNegatives.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {pendingNegatives.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.phrase}</p>
                        <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
                          {negativeSourceBadge(item.source)}
                        </span>
                      </div>
                      {item.reason ? (
                        <p className="text-xs text-[var(--fg-muted)]">{item.reason}</p>
                      ) : null}
                    </div>
                    {!readOnly ? (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className={btnClass("primary")}
                          disabled={pending}
                          onClick={() => onResolveNegative(item.id, "accept")}
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          className={btnClass("secondary")}
                          disabled={pending}
                          onClick={() => onResolveNegative(item.id, "reject")}
                        >
                          Отклонить
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : suggestions.length > 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                Все предложения агента обработаны.
              </p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 font-medium">Структура кампаний</h3>
            {planReady && campaignPlan?.plan ? (
              <div className="flex flex-col gap-4">
                {campaignPlan.plan.campaigns.map((campaign) => (
                  <div
                    key={campaign.name}
                    className="rounded border border-[var(--border)] bg-[var(--bg-mid)] p-4 text-sm"
                  >
                    <p className="mb-1 font-medium">{campaign.name}</p>
                    <p className="mb-2 text-[var(--fg-muted)]">{campaign.rationale}</p>
                    <ul className="list-disc pl-5 text-[var(--fg)]">
                      {campaign.ad_groups.map((group) => (
                        <li key={group.name}>
                          {group.name}
                          <span className="text-xs text-[var(--fg-muted)]">
                            {" "}
                            — кластеры: {group.cluster_names.join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Структура ещё не сформирована">
                Нажмите «Сформировать структуру» — агент предложит кампании и
                группы с обоснованием.
              </EmptyState>
            )}
          </section>

          {planReady && !planApproved ? (
            <div className="rounded border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4">
              <p className="mb-3 text-sm text-[var(--fg)]">
                Проверьте ключи, минус-слова и структуру. «Ок, собирай» утверждает
                план и запускает объявления с черновиком кампании.
                {pendingNegatives.length > 0
                  ? ` ${pendingNegatives.length} минус-слов будут приняты в бриф.`
                  : ""}
              </p>
              <button
                type="button"
                className={btnClass("primary", "w-fit")}
                onClick={onApprove}
                disabled={pending || readOnly || !aiReady}
              >
                {pending ? "Собираем…" : "Ок, собирай"}
              </button>
            </div>
          ) : planApproved ? (
            <p className="text-sm text-[var(--fg-muted)]">
              План утверждён — дальше «Объявления» и «Кампания».
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
