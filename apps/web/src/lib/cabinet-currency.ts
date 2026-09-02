const CURRENCY_SYMBOL: Record<string, string> = {
  RUB: "₽",
  KZT: "₸",
  USD: "$",
  EUR: "€",
};

export function cabinetCurrencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  if (CURRENCY_SYMBOL[code]) return CURRENCY_SYMBOL[code];
  if (currency.trim()) return currency.trim();
  return "₽";
}

export function formatCabinetSpend(amount: number, currency: string): string {
  const symbol = cabinetCurrencySymbol(currency);
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}
