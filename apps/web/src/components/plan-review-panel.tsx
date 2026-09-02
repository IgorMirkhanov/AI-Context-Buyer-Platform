"use client";

import { isKeywordCommercial } from "@/lib/semantic-keywords";
import { btnClass } from "@/ui/button";
import { EmptyState } from "@/ui/states";
import { TermHint } from "@/ui/term-hint";

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
  status: "pending" | "accepted" | "rejected";
};

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
      if (!isKeywordCommercial(kw)) {
        continue;
      }
      rows.push({ ...kw, clusterName: cluster.name });
    }
  }
  return rows.sort((a, b) => b.frequency - a.frequency);
}

export function PlanReviewPanel({
  semantic,
  briefNegatives,
  campaignPlan,
  readOnly,
  pending,
  aiReady,
  onRunPlan,
  onApprove,
  onResolveNegative,
}: Props) {
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
      <div>
        <p className="mb-3 text-sm text-zinc-600">
          {campaignPlan?.task
            ? `Задача плана: ${campaignPlan.task.status}${campaignPlan.task.error ? ` · ${campaignPlan.task.error}` : ""}`
            : planReady
              ? `Структура: ${campaignPlan?.campaignCount ?? 0} кампаний${campaignPlan?.llmMode ? ` · ${campaignPlan.llmMode}` : ""}`
              : "Сформируйте план после сбора семантики"}
          {planApproved ? " · утверждён" : ""}
        </p>
        <button
          type="button"
          className={btnClass("secondary")}
          onClick={onRunPlan}
          disabled={pending || readOnly || !hasSemantic || !aiReady}
        >
          {pending
            ? "Формируем…"
            : planReady
              ? "Пересформировать структуру"
              : "Сформировать структуру кампаний"}
        </button>
      </div>

      {!hasSemantic ? (
        <EmptyState title="Сначала соберите семантику">
          На вкладке «Семантика» или через пайплайн соберите ядро — здесь
          появится коммерческий список ключей и минус-слова.
        </EmptyState>
      ) : (
        <>
          <section>
            <h3 className="mb-2 font-medium">
              <TermHint term="cluster">Коммерческие ключи</TermHint>{" "}
              <span className="text-sm font-normal text-zinc-500">
                ({keywords.length})
              </span>
            </h3>
            <p className="mb-3 text-sm text-zinc-600">
              Итоговый список для запуска — только коммерческий интент, без
              обзоров и навигационных запросов.
            </p>
            <div className="max-h-72 overflow-auto rounded border border-zinc-200">
              <table className="ui-table w-full text-sm">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="py-1 pl-2 pr-2 text-left">Фраза</th>
                    <th className="py-1 pr-2 text-left">Кластер</th>
                    <th className="py-1 pr-2 text-left">Интент</th>
                    <th className="py-1 pr-2 text-right">Частота</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw) => (
                    <tr
                      key={`${kw.clusterName}:${kw.phrase}`}
                      className="border-t border-zinc-100"
                    >
                      <td className="py-1 pl-2 pr-2">{kw.phrase}</td>
                      <td className="py-1 pr-2 text-zinc-600">
                        {kw.clusterName}
                      </td>
                      <td className="py-1 pr-2">{kw.intent}</td>
                      <td className="py-1 pr-2 text-right">{kw.frequency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">Минус-слова</h3>
            <p className="mb-3 text-sm text-zinc-600">
              Базовые из брифа и предложенные агентом по собранной семантике.
              Перед утверждением проверьте предложения — при «Ок, собирай»
              ожидающие будут приняты в бриф автоматически.
            </p>
            {allMinusWords.length > 0 ? (
              <p className="mb-2 text-sm">
                <span className="text-zinc-500">В брифе: </span>
                {allMinusWords.join(", ")}
              </p>
            ) : (
              <p className="mb-2 text-sm text-zinc-500">
                Глобальные минусы брифа не заданы.
              </p>
            )}
            {pendingNegatives.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {pendingNegatives.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.phrase}</p>
                      {item.reason ? (
                        <p className="text-xs text-zinc-500">{item.reason}</p>
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
              <p className="text-sm text-zinc-500">
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
                    className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm"
                  >
                    <p className="mb-1 font-medium">{campaign.name}</p>
                    <p className="mb-2 text-zinc-600">{campaign.rationale}</p>
                    <ul className="list-disc pl-5 text-zinc-700">
                      {campaign.ad_groups.map((group) => (
                        <li key={group.name}>
                          {group.name}
                          <span className="text-xs text-zinc-500">
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
                Нажмите «Сформировать структуру кампаний» — агент предложит,
                сколько кампаний и групп нужно и почему.
              </EmptyState>
            )}
          </section>

          {planReady && !planApproved ? (
            <div className="rounded border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="mb-3 text-sm text-zinc-700">
                Проверьте ключи, минус-слова и структуру. Одной кнопкой
                утверждаете план и запускаете копирайтинг с черновиком кампании.
                {pendingNegatives.length > 0
                  ? ` ${pendingNegatives.length} предложенных минус-слов будут приняты в бриф.`
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
            <p className="text-sm text-zinc-600">
              План утверждён. Объявления и черновик — на вкладках «Объявления» и
              «Кампания».
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
