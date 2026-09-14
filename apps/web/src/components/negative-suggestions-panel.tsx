"use client";

import { btnClass } from "@/ui/button";

export type NegativeSuggestionSource =
  | "keyword_planner_noncommercial"
  | "llm_niche_antonym"
  | "llm_negative_words"
  | string;

type NegativeSuggestion = {
  id: string;
  phrase: string;
  reason: string;
  source?: NegativeSuggestionSource;
  status: "pending" | "accepted" | "rejected";
};

type Props = {
  suggestions: NegativeSuggestion[];
  readOnly: boolean;
  pending: boolean;
  onResolve: (suggestionId: string, action: "accept" | "reject") => void;
};

export function negativeSourceBadgeLabel(source?: string): string {
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

export function NegativeSuggestionsPanel({
  suggestions,
  readOnly,
  pending,
  onResolve,
}: Props) {
  const pendingItems = suggestions.filter((item) => item.status === "pending");
  const resolvedItems = suggestions.filter((item) => item.status !== "pending");

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-[var(--radius)] border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] p-4">
      <h3 className="mb-1 font-medium text-[var(--fg)]">
        Предложенные минус-слова
      </h3>
      <p className="mb-3 text-sm text-[var(--fg-muted)]">
        Агент нашёл нецелевые формулировки в собранной семантике. Примите
        минус-слово — оно попадёт в глобальные минусы брифа; отклоните — не
        будет предлагаться снова.
      </p>
      {pendingItems.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {pendingItems.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded border border-[var(--status-alert-border)] bg-[var(--bg-elevated)] px-3 py-2"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[var(--fg)]">{item.phrase}</p>
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
                    {negativeSourceBadgeLabel(item.source)}
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
                    onClick={() => onResolve(item.id, "accept")}
                  >
                    Принять
                  </button>
                  <button
                    type="button"
                    className={btnClass("secondary")}
                    disabled={pending}
                    onClick={() => onResolve(item.id, "reject")}
                  >
                    Отклонить
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-[var(--fg-muted)]">
          Нет ожидающих решения — все предложения обработаны.
        </p>
      )}
      {resolvedItems.length > 0 ? (
        <p className="text-xs text-[var(--fg-muted)]">
          Обработано:{" "}
          {resolvedItems
            .map(
              (item) =>
                `${item.phrase} (${
                  item.status === "accepted" ? "принято" : "отклонено"
                })`,
            )
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}
