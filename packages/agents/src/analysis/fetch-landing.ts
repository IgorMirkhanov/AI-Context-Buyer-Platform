const MAX_LANDING_BYTES = 512_000;
const MAX_LANDING_CHARS = 12_000;

export async function fetchLandingText(
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = normalizeWebsiteUrl(websiteUrl);
  const res = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ContextBuyerBot/1.0 (+analysis)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить сайт: HTTP ${res.status}`);
  }
  const raw = await res.text();
  if (raw.length > MAX_LANDING_BYTES) {
    throw new Error("Страница слишком большая для анализа");
  }
  return extractVisibleText(raw).slice(0, MAX_LANDING_CHARS);
}

export function normalizeWebsiteUrl(websiteUrl: string): string {
  const trimmed = websiteUrl.trim();
  if (!trimmed) {
    throw new Error("URL сайта не указан");
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Поддерживаются только http/https URL");
  }
  return parsed.toString();
}

export function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}
