import { KeywordIdea, KeywordIntent, SemanticBriefInput } from "./types";

/** Сервисные токены — не коммерческое ядро даже если Wordstat их подсунул. */
const SERVICE_NEGATIVE_TOKENS = ["ремонт"];

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

/**
 * Общеупотребимые intent-модификаторы: при кластеризации hash-n-gram
 * дают ложное сходство между разными продуктами («… официальный сайт»).
 * Снимаются до эмбеддинга; intent на ключе сохраняется отдельно.
 */
const CLUSTERING_PREFIXES = ["купить "];
const CLUSTERING_TAILS = [
  "официальный сайт",
  "отзывы",
  "обзор",
  "цена",
  "заказать",
];

/** Продуктовое ядро фразы для кластеризации (без коммерческих/навиг. хвостов). */
export function phraseClusteringCore(phrase: string): string {
  let core = normalizeMask(phrase);
  for (const prefix of CLUSTERING_PREFIXES) {
    if (core.startsWith(prefix)) {
      core = core.slice(prefix.length).trim();
      break;
    }
  }
  for (const tail of CLUSTERING_TAILS) {
    const suffix = ` ${tail}`;
    if (core.endsWith(suffix)) {
      core = core.slice(0, -suffix.length).trim();
      break;
    }
  }
  return core.length >= 3 ? core : normalizeMask(phrase);
}

export function isIntentTailKeyword(intent: KeywordIntent): boolean {
  return intent === "navigational" || intent === "warm";
}

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

function singularizeToken(token: string): string {
  if (/ные$/u.test(token)) {
    return token.replace(/ные$/u, "ный");
  }
  if (/ые$/u.test(token)) {
    return token.replace(/ые$/u, "ой");
  }
  if (/ки$/u.test(token)) {
    return token.slice(0, -1);
  }
  if (/ы$/u.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeMask(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Производные маски из УТП: сингуляр, хвост «ноутбук asus», бренд, линейка ROG. */
export function deriveMasksFromUsp(usp: string): string[] {
  const base = normalizeMask(usp);
  if (base.length < 3) {
    return [];
  }
  const tokens = base.split(/\s+/).filter(Boolean);
  const singular = tokens.map(singularizeToken).join(" ");
  const derived = new Set<string>();

  if (singular !== base) {
    derived.add(singular);
  }
  if (tokens.length >= 3 && /(?:ые|ий|ая|ое)$/u.test(tokens[0] ?? "")) {
    derived.add(tokens.slice(1).map(singularizeToken).join(" "));
  }
  for (const token of tokens) {
    if (/^[a-z0-9][a-z0-9-]*$/i.test(token)) {
      derived.add(token.toLowerCase());
    }
  }
  if (/\basus\b/i.test(base) && /игр/i.test(base)) {
    derived.add("asus rog");
    derived.add("ноутбук asus rog");
  }

  derived.delete(base);
  return [...derived].filter((mask) => mask.length >= 3);
}

export function masksFromBrief(
  brief: SemanticBriefInput,
  landingText = "",
): string[] {
  const masks: string[] = [];
  const push = (value: string) => {
    const normalized = normalizeMask(value);
    if (normalized.length >= 3) {
      masks.push(normalized);
    }
  };

  for (const usp of brief.usp) {
    push(usp);
    for (const derived of deriveMasksFromUsp(usp)) {
      push(derived);
    }
  }
  if (brief.product_description) {
    push(brief.product_description.split(/[.!]/)[0] ?? "");
  }
  for (const token of landingText.split(/[\s,.;:]+/)) {
    if (token.length > 5) {
      push(token);
    }
  }

  return Array.from(new Set(masks)).slice(0, 20);
}

export function phraseMatchesNegatives(
  phrase: string,
  negatives: string[],
): boolean {
  const normalized = normalizeMask(phrase);
  const tokens = new Set(tokenize(phrase));
  for (const raw of negatives) {
    const neg = normalizeMask(raw);
    if (!neg) continue;
    if (neg.includes(" ")) {
      if (normalized.includes(neg)) return true;
    } else if (tokens.has(neg)) {
      return true;
    }
  }
  return false;
}

export function filterKeywordIdeas(
  ideas: KeywordIdea[],
  negatives: string[],
): KeywordIdea[] {
  const blocked = [...negatives, ...SERVICE_NEGATIVE_TOKENS];
  return ideas.filter((idea) => !phraseMatchesNegatives(idea.phrase, blocked));
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
