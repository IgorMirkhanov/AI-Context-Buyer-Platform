import { KeywordIdea, PlatformAuth, PlatformApiError } from "./types";
import { GoogleAdsApi } from "./google-ads.api";

export type { KeywordIdea };

export interface KeywordIdeasProvider {
  getKeywordIdeas(
    seedKeywords: string[],
    geo: string[],
    auth?: PlatformAuth,
  ): Promise<KeywordIdea[]>;
}

/**
 * Keep in sync with COMMERCIAL_TRIGGERS in packages/agents semantic heuristics.
 * Connectors must not import agents (dependency direction).
 */
const COMMERCIAL_TRIGGERS = [
  "купить",
  "заказать",
  "записаться",
  "стоимость",
  "цена",
  "доставка",
  "наличие",
] as const;

function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Маска уже содержит коммерческий модификатор — не дублировать шаблонами мока. */
export function seedHasCommercialModifier(seed: string): boolean {
  const base = normalizeSeed(seed);
  if (!base) return false;
  const tokens = base.split(/\s+/).filter(Boolean);
  return COMMERCIAL_TRIGGERS.some((trigger) => {
    if (tokens[0] === trigger) return true;
    if (tokens[tokens.length - 1] === trigger) return true;
    return tokens.includes(trigger);
  });
}

/**
 * Мок Wordstat / Keyword Planner. Подменяется LiveGoogleKeywordIdeasProvider
 * при GOOGLE_ADS_MOCK=0.
 */
export class MockKeywordIdeasProvider implements KeywordIdeasProvider {
  async getKeywordIdeas(
    seedKeywords: string[],
    _geo: string[],
    _auth?: PlatformAuth,
  ): Promise<KeywordIdea[]> {
    const ideas: KeywordIdea[] = [];
    const seen = new Set<string>();

    const push = (phrase: string, frequency: number) => {
      const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      ideas.push({ phrase: normalized, frequency, source: "mock_wordstat" });
    };

    for (const seed of seedKeywords) {
      const base = normalizeSeed(seed);
      if (!base) continue;
      if (seedHasCommercialModifier(base)) {
        push(base, 1200);
        continue;
      }
      push(base, 1200);
      push(`купить ${base}`, 900);
      push(`${base} цена`, 540);
      push(`${base} заказать`, 410);
      push(`${base} обзор`, 280);
      push(`${base} отзывы`, 190);
      push(`${base} официальный сайт`, 150);
      push(`${base} ремонт`, 80);
      push(`${base} бесплатно`, 0);
    }

    return ideas;
  }
}

/**
 * Live Keyword Plan Idea Service via the shared GoogleAdsApi client
 * (same developer token / OAuth headers as campaign mutations).
 */
export class LiveGoogleKeywordIdeasProvider implements KeywordIdeasProvider {
  constructor(private readonly api: GoogleAdsApi) {}

  async getKeywordIdeas(
    seedKeywords: string[],
    geo: string[],
    auth?: PlatformAuth,
  ): Promise<KeywordIdea[]> {
    if (!auth?.accessToken || !auth.clientLogin) {
      throw new PlatformApiError(
        "Подключите Google Ads к проекту для Keyword Planner. " +
          "Пока нет Basic Access к Google Ads API — поставьте GOOGLE_ADS_MOCK=1.",
        "generateKeywordIdeas",
        "missing token or customer id",
      );
    }
    const projectId = auth.projectId;
    if (!projectId) {
      throw new PlatformApiError(
        "projectId is required for Google Keyword Planner",
        "generateKeywordIdeas",
        "missing projectId",
      );
    }
    return this.api.generateKeywordIdeas(
      {
        accessToken: auth.accessToken,
        customerId: auth.clientLogin.replace(/-/g, ""),
        projectId,
      },
      seedKeywords,
      geo,
    );
  }
}
