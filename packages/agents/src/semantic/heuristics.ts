import { KeywordIntent, SemanticBriefInput } from "./types";

const HOT_MARKERS = [
  "купить",
  "цена",
  "заказать",
  "стоимость",
  "заказать",
  "доставка",
  "наличие",
];
const WARM_MARKERS = ["обзор", "отзыв", "сравнен", "какой", "рейтинг", "лучш"];
const NAV_MARKERS = ["официальный сайт", "сайт", "бренд", "логотип"];

export function intentFromHeuristics(phrase: string): KeywordIntent | null {
  const p = phrase.toLowerCase();
  if (NAV_MARKERS.some((m) => p.includes(m))) {
    return "navigational";
  }
  if (HOT_MARKERS.some((m) => p.includes(m))) {
    return "hot";
  }
  if (WARM_MARKERS.some((m) => p.includes(m))) {
    return "warm";
  }
  return null;
}

export function masksFromBrief(
  brief: SemanticBriefInput,
  landingText = "",
): string[] {
  const masks: string[] = [];
  const push = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized.length >= 3) {
      masks.push(normalized);
    }
  };

  for (const usp of brief.usp) {
    push(usp);
  }
  for (const audience of brief.target_audience) {
    push(audience.segment);
  }
  if (brief.product_description) {
    push(brief.product_description.split(/[.!]/)[0] ?? "");
  }
  if (brief.website_url) {
    try {
      const host = new URL(brief.website_url).hostname.replace(/^www\./, "");
      push(host.split(".")[0] ?? "");
    } catch {
      // ignore invalid URL
    }
  }
  for (const token of landingText.split(/[\s,.;:]+/)) {
    if (token.length > 5) {
      push(token);
    }
  }

  return Array.from(new Set(masks)).slice(0, 20);
}

export function extraNegativesFromBrief(brief: SemanticBriefInput): string[] {
  const extras: string[] = [];
  if ((brief.price_segment ?? "").toLowerCase() === "premium") {
    extras.push("дешевый", "дешёвый", "б/у", "бу", "китай");
  }
  for (const phrase of brief.forbidden_phrases ?? []) {
    extras.push(phrase.toLowerCase());
  }
  return extras;
}

export function tokenize(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .filter((token) => token.length > 2);
}
