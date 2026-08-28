"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";

export const GLOSSARY = {
  cluster:
    "Кластер — группа похожих поисковых фраз, из которой собирается одна группа объявлений. Так проще писать тексты и минусовать чужие темы.",
  intent:
    "Интент — зачем человек ищет: купить сейчас, сравнить варианты или найти конкретный бренд/сайт.",
  intent_hot:
    "hot — «горячий» запрос: купить, цена, заказать. Человек ближе к заявке.",
  intent_warm:
    "warm — сравнение и выбор: обзор, отзывы, рейтинг. Ещё думает.",
  intent_navigational:
    "navigational — ищет конкретный бренд или сайт («официальный сайт»).",
  pacing:
    "Pacing — темп расхода: сколько уже потратили за период по сравнению с планом из дневного бюджета. Не путать с CPL.",
  cpl:
    "CPL — стоимость лида: расход ÷ число конверсий. Цель CPL задаётся в брифе (target_cpl).",
  cross_minus:
    "Кросс-минусация — фразы соседних кластеров добавляются минусами, чтобы объявление «ноутбуки Asus» не показывалось по запросу HP.",
  usp:
    "УТП — чем вы отличаетесь (гарантия, доставка, ассортимент). Агент подставляет это в объявления.",
  geo:
    "Гео — регионы показов. Коды вроде RU-MOW (Москва), KZ-ALA (Алматы).",
  paused:
    "Кампания создаётся на паузе: в кабинете её видно, но показы не идут и бюджет не списывается, пока вы не включите её там.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

type BeginnerModeValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
};

const BeginnerModeContext = createContext<BeginnerModeValue>({
  enabled: false,
  setEnabled: () => undefined,
});

export function BeginnerModeProvider({
  enabled,
  onChange,
  children,
}: {
  enabled: boolean;
  onChange?: (next: boolean) => void;
  children: ReactNode;
}) {
  const setEnabled = useCallback(
    (next: boolean) => {
      onChange?.(next);
    },
    [onChange],
  );
  return (
    <BeginnerModeContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </BeginnerModeContext.Provider>
  );
}

export function useBeginnerMode(): BeginnerModeValue {
  return useContext(BeginnerModeContext);
}
