import { AnalyticsCampaignSlice } from "./types";

const CURRENCY_SYMBOL: Record<string, string> = {
  RUB: "₽",
  KZT: "₸",
  USD: "$",
  EUR: "€",
};

/** Sum spend across campaign slices (rolling window totals from report.campaigns[]). */
export function sumCampaignSpend(campaigns: AnalyticsCampaignSlice[]): number {
  return campaigns.reduce((sum, camp) => sum + camp.metrics.spend, 0);
}

export function cabinetCurrencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (CURRENCY_SYMBOL[code]) return CURRENCY_SYMBOL[code];
  if (currency.trim()) return currency.trim();
  return "₽";
}

/** Absolute spend in cabinet currency — not a percent or ratio. */
export function formatCabinetSpend(amount: number, currency: string): string {
  const symbol = cabinetCurrencySymbol(currency);
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}
