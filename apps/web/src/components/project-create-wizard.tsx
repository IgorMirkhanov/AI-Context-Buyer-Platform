"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/ui/button";
import { CardHint, CardTitle } from "@/ui/card";
import { Alert } from "@/ui/alert";
import { BeginnerNote } from "@/ui/term-hint";
import { useBeginnerMode } from "@/lib/beginner-mode";

const STEPS = [
  { id: "product", title: "О продукте" },
  { id: "audience", title: "Аудитория и УТП" },
  { id: "budget", title: "Бюджет и гео" },
  { id: "cabinet", title: "Подключить кабинет" },
] as const;

export function ProjectCreateWizard({
  name,
  setName,
  primaryPlatform,
  setPrimaryPlatform,
  websiteUrl,
  setWebsiteUrl,
  geo,
  setGeo,
  budgetDaily,
  setBudgetDaily,
  usp,
  setUsp,
  audience,
  setAudience,
  negatives,
  setNegatives,
  error,
  onSubmit,
}: {
  name: string;
  setName: (value: string) => void;
  primaryPlatform: string;
  setPrimaryPlatform: (value: string) => void;
  websiteUrl: string;
  setWebsiteUrl: (value: string) => void;
  geo: string;
  setGeo: (value: string) => void;
  budgetDaily: string;
  setBudgetDaily: (value: string) => void;
  usp: string;
  setUsp: (value: string) => void;
  audience: string;
  setAudience: (value: string) => void;
  negatives: string;
  setNegatives: (value: string) => void;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
}) {
  const { enabled: beginner } = useBeginnerMode();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const canAdvance =
    step === 0
      ? Boolean(name.trim() && websiteUrl.trim())
      : step === 1
        ? Boolean(usp.trim() && audience.trim())
        : step === 2
          ? Boolean(geo.trim() && Number(budgetDaily) > 0)
          : true;

  function handleSubmit(event: FormEvent) {
    if (!last) {
      event.preventDefault();
      if (canAdvance) setStep((value) => value + 1);
      return;
    }
    onSubmit(event);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <CardTitle>Новый проект + бриф</CardTitle>
      <ol className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            className={
              index === step
                ? "font-medium text-[var(--fg)]"
                : index < step
                  ? "text-[var(--fg)]"
                  : ""
            }
          >
            {index + 1}. {item.title}
            {index < STEPS.length - 1 ? " →" : ""}
          </li>
        ))}
      </ol>
      <p className="text-sm font-medium">{STEPS[step].title}</p>

      {step === 0 ? (
        <>
          {beginner ? (
            <CardHint>
              Название видно только вам в портфеле. Сайт нужен агенту, чтобы
              понять оффер. Платформу (Яндекс или Google) можно сменить до
              подключения кабинета. OAuth — на странице проекта после создания.
            </CardHint>
          ) : null}
          <input
            className="ui-input"
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  id: "yandex_direct",
                  title: "Яндекс Директ",
                  hint: "Основной рынок RU",
                },
                {
                  id: "google_ads",
                  title: "Google Ads",
                  hint: "Search / Performance Max",
                },
              ] as const
            ).map((item) => {
              const active = primaryPlatform === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                      : "border-[var(--border)] bg-[var(--bg-mid)] hover:bg-[var(--bg-high)]"
                  }`}
                  onClick={() => setPrimaryPlatform(item.id)}
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
          <input
            className="ui-input"
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            required
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          {beginner ? (
            <CardHint>
              УТП и сегменты аудитории попадут в бриф (JSON-схема проекта).
              Минус-слова сразу отсекают запросы вроде «бесплатно» и «скачать».
            </CardHint>
          ) : null}
          <BeginnerNote term="usp" />
          <textarea
            className="ui-input"
            placeholder="УТП — каждое с новой строки"
            value={usp}
            onChange={(e) => setUsp(e.target.value)}
            required
            rows={3}
          />
          <textarea
            className="ui-input"
            placeholder="Целевая аудитория — сегмент с новой строки"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            required
            rows={2}
          />
          <textarea
            className="ui-input"
            placeholder="Минус-слова (через запятую или с новой строки)"
            value={negatives}
            onChange={(e) => setNegatives(e.target.value)}
            rows={2}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          {beginner ? (
            <CardHint>
              Дневной бюджет — план расхода на день. Гео — где показывать
              объявления. Позже по ним считается pacing.
            </CardHint>
          ) : null}
          <BeginnerNote term="geo" />
          <input
            className="ui-input"
            placeholder="Гео (через запятую), например RU-MOW, KZ-ALA"
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            required
          />
          <input
            className="ui-input"
            type="number"
            min={1}
            placeholder="Дневной бюджет, RUB"
            value={budgetDaily}
            onChange={(e) => setBudgetDaily(e.target.value)}
            required
          />
          <BeginnerNote term="pacing" />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <p className="text-sm text-[var(--fg-muted)]">
            После «Создать» откроется страница проекта. В блоке «Подключение
            кабинета» выберите{" "}
            {primaryPlatform === "google_ads"
              ? "Google Ads"
              : "Яндекс Директ"}{" "}
            (при необходимости можно сменить) и нажмите «Подключить». Без
            кабинета агент не выгрузит кампанию в рекламный API. Публикация
            всё равно только вручную и на паузе.
          </p>
          <BeginnerNote term="paused" />
        </>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep((value) => value - 1)}
          >
            Назад
          </Button>
        ) : null}
        {last ? (
          <Button type="submit">Создать</Button>
        ) : (
          <Button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={!canAdvance}
          >
            Далее
          </Button>
        )}
      </div>
    </form>
  );
}
