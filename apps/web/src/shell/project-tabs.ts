export const PROJECT_TABS = [
  { id: "brief", label: "Бриф" },
  { id: "analysis", label: "Анализ" },
  { id: "semantic", label: "Семантика" },
  { id: "plan", label: "План" },
  { id: "ads", label: "Объявления" },
  { id: "campaign", label: "Кампания" },
  { id: "analytics", label: "Аналитика" },
  { id: "recs", label: "Рекомендации" },
  { id: "autopilot", label: "Автопилот" },
  { id: "audit", label: "Журнал" },
  { id: "spend", label: "Расходы" },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];

export function parseProjectTab(raw: string | null): ProjectTabId {
  const found = PROJECT_TABS.find((item) => item.id === raw);
  return found?.id ?? "brief";
}
