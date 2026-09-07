"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert } from "@/ui/alert";
import { btnClass } from "@/ui/button";
import { BeginnerNote } from "@/ui/term-hint";

export type BriefFormData = {
  websiteUrl: string;
  geo: string;
  budgetDaily: string;
  budgetCurrency: string;
  targetCpl: string;
  usp: string;
  audience: string;
  negatives: string;
};

export type BriefPayload = {
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
  exclusions: {
    global_negative_keywords: string[];
  };
};

function splitTokens(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function briefToForm(
  brief: BriefPayload | null,
  websiteUrl: string | null,
): BriefFormData {
  if (!brief) {
    return {
      websiteUrl: websiteUrl ?? "",
      geo: "",
      budgetDaily: "3000",
      budgetCurrency: "RUB",
      targetCpl: "",
      usp: "",
      audience: "",
      negatives: "",
    };
  }
  return {
    websiteUrl: brief.project.website_url,
    geo: brief.project.geo.join(", "),
    budgetDaily: String(brief.project.budget.daily),
    budgetCurrency: brief.project.budget.currency,
    targetCpl:
      brief.project.target_cpl != null ? String(brief.project.target_cpl) : "",
    usp: brief.marketing.usp.join("\n"),
    audience: brief.marketing.target_audience.map((item) => item.segment).join("\n"),
    negatives: brief.exclusions.global_negative_keywords.join(", "),
  };
}

export function formToUpsertBody(form: BriefFormData) {
  const targetCpl = form.targetCpl.trim()
    ? Number(form.targetCpl)
    : undefined;
  return {
    websiteUrl: form.websiteUrl.trim(),
    geo: splitTokens(form.geo),
    budgetDaily: Number(form.budgetDaily),
    budgetCurrency: form.budgetCurrency.trim() || "RUB",
    ...(targetCpl != null && !Number.isNaN(targetCpl) && targetCpl > 0
      ? { targetCpl }
      : {}),
    usp: form.usp
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    targetAudience: form.audience
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((segment) => ({ segment })),
    globalNegativeKeywords: splitTokens(form.negatives),
  };
}

export function BriefEditor({
  brief,
  websiteUrl,
  readOnly,
  pending,
  onSave,
}: {
  brief: BriefPayload | null;
  websiteUrl: string | null;
  readOnly: boolean;
  pending: boolean;
  onSave: (body: ReturnType<typeof formToUpsertBody>) => Promise<void>;
}) {
  const [form, setForm] = useState(() => briefToForm(brief, websiteUrl));
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(briefToForm(brief, websiteUrl));
    setDirty(false);
    setLocalError(null);
  }, [brief, websiteUrl]);

  function update<K extends keyof BriefFormData>(key: K, value: BriefFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setLocalError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const body = formToUpsertBody(form);
    if (!body.websiteUrl) {
      setLocalError("Укажите сайт");
      return;
    }
    if (body.geo.length === 0) {
      setLocalError("Укажите хотя бы один регион (гео)");
      return;
    }
    if (!Number.isFinite(body.budgetDaily) || body.budgetDaily <= 0) {
      setLocalError("Дневной бюджет должен быть больше нуля");
      return;
    }
    if (body.usp.length === 0) {
      setLocalError("Добавьте хотя бы одно УТП");
      return;
    }
    if (body.targetAudience.length === 0) {
      setLocalError("Укажите хотя бы один сегмент аудитории");
      return;
    }
    await onSave(body);
    setDirty(false);
  }

  if (readOnly && !brief) {
    return (
      <p className="text-sm text-[var(--fg-muted)]">
        Бриф ещё не заполнен. Попросите контекстолога добавить данные проекта.
      </p>
    );
  }

  if (readOnly && brief) {
    return (
      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-[var(--fg-muted)]">Сайт</dt>
          <dd>{brief.project.website_url}</dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Гео</dt>
          <dd>{brief.project.geo.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Бюджет</dt>
          <dd>
            {brief.project.budget.daily} {brief.project.budget.currency} / день
          </dd>
        </div>
        {brief.project.target_cpl != null ? (
          <div>
            <dt className="text-[var(--fg-muted)]">Целевой CPL</dt>
            <dd>{brief.project.target_cpl}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[var(--fg-muted)]">УТП</dt>
          <dd>
            <ul className="list-disc pl-5">
              {brief.marketing.usp.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Аудитория</dt>
          <dd>
            {brief.marketing.target_audience.map((item) => item.segment).join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Минус-слова</dt>
          <dd>
            {brief.exclusions.global_negative_keywords.length > 0
              ? brief.exclusions.global_negative_keywords.join(", ")
              : "—"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--fg-muted)]">
        {brief
          ? "Изменения сохраняются как новая версия брифа. Агенты используют последнюю версию."
          : "Заполните бриф — он нужен для анализа, семантики и генерации объявлений."}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">Сайт</span>
        <input
          className="ui-input"
          placeholder="https://example.com"
          value={form.websiteUrl}
          onChange={(event) => update("websiteUrl", event.target.value)}
          required
          disabled={readOnly || pending}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">Гео</span>
        <BeginnerNote term="geo" />
        <input
          className="ui-input"
          placeholder="RU-MOW, RU-SPE — через запятую"
          value={form.geo}
          onChange={(event) => update("geo", event.target.value)}
          required
          disabled={readOnly || pending}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--fg-muted)]">Дневной бюджет</span>
          <input
            className="ui-input"
            type="number"
            min={1}
            value={form.budgetDaily}
            onChange={(event) => update("budgetDaily", event.target.value)}
            required
            disabled={readOnly || pending}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--fg-muted)]">Валюта</span>
          <input
            className="ui-input"
            value={form.budgetCurrency}
            onChange={(event) => update("budgetCurrency", event.target.value)}
            disabled={readOnly || pending}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">Целевой CPL (необязательно)</span>
        <input
          className="ui-input"
          type="number"
          min={0}
          placeholder="например 1500"
          value={form.targetCpl}
          onChange={(event) => update("targetCpl", event.target.value)}
          disabled={readOnly || pending}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">УТП</span>
        <BeginnerNote term="usp" />
        <textarea
          className="ui-input"
          rows={3}
          placeholder="Каждое УТП с новой строки"
          value={form.usp}
          onChange={(event) => update("usp", event.target.value)}
          required
          disabled={readOnly || pending}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">Аудитория</span>
        <textarea
          className="ui-input"
          rows={2}
          placeholder="Сегмент с новой строки"
          value={form.audience}
          onChange={(event) => update("audience", event.target.value)}
          required
          disabled={readOnly || pending}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--fg-muted)]">Минус-слова</span>
        <textarea
          className="ui-input"
          rows={2}
          placeholder="Через запятую или с новой строки"
          value={form.negatives}
          onChange={(event) => update("negatives", event.target.value)}
          disabled={readOnly || pending}
        />
      </label>
      {localError ? (
        <Alert tone="danger">{localError}</Alert>
      ) : null}
      {!readOnly ? (
        <button
          type="submit"
          className={btnClass("primary", "w-fit")}
          disabled={pending || (!dirty && Boolean(brief))}
        >
          {pending ? "Сохраняем…" : brief ? "Сохранить бриф" : "Создать бриф"}
        </button>
      ) : null}
    </form>
  );
}
