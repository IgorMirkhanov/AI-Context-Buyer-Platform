import { KeywordIdea } from "./types";

export type { KeywordIdea };

export interface KeywordIdeasProvider {
  getKeywordIdeas(
    seedKeywords: string[],
    geo: string[],
  ): Promise<KeywordIdea[]>;
}

const COMMERCIAL_PREFIX = /^купить\s+/u;
const COMMERCIAL_PRICE_TAIL = /\s(цена|стоимость)$/u;

/** Маска уже содержит коммерческий модификатор — не дублировать шаблонами мока. */
export function seedHasCommercialModifier(seed: string): boolean {
  const base = seed.trim().toLowerCase().replace(/\s+/g, " ");
  return COMMERCIAL_PREFIX.test(base) || COMMERCIAL_PRICE_TAIL.test(base);
}

/**
 * Мок Wordstat / Keyword Planner. Подменяется реальной реализацией на Этапе 4.
 */
export class MockKeywordIdeasProvider implements KeywordIdeasProvider {
  async getKeywordIdeas(
    seedKeywords: string[],
    _geo: string[],
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
      const base = seed.trim().toLowerCase().replace(/\s+/g, " ");
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
