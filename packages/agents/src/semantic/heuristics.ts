import { KeywordIdea, KeywordIntent, SemanticBriefInput } from "./types";

/** Сервисные токены — не коммерческое ядро даже если Wordstat их подсунул. */
const SERVICE_NEGATIVE_TOKENS = ["ремонт"];

const HOT_MARKERS = [
  "купить",
  "цена",
  "заказать",
  "записаться",
  "стоимость",
  "доставка",
  "наличие",
];
const WARM_MARKERS = ["обзор", "отзыв", "сравнен", "какой", "рейтинг", "лучш"];
const NAV_MARKERS = ["официальный сайт", "сайт", "бренд", "логотип"];

/** Явные коммерческие триггеры (услуга + гео + цена в одной фразе). */
export const COMMERCIAL_TRIGGERS = [
  "купить",
  "заказать",
  "записаться",
  "стоимость",
  "цена",
  "доставка",
  "наличие",
] as const;

/** Обзорные/навигационные маркеры — не коммерческие, даже при warm/hot. */
const NON_COMMERCIAL_MARKERS = [
  ...NAV_MARKERS,
  "обзор",
  "отзыв",
  "отзывы",
  "рейтинг",
  "сравнен",
  "какой",
  "лучш",
];

const GEO_LABELS: Record<string, string> = {
  RU: "россия",
  "RU-MOW": "москва",
  "RU-SPE": "санкт-петербург",
  "RU-SPB": "санкт-петербург",
  "RU-KDA": "краснодар",
  "RU-SVE": "екатеринбург",
  "RU-NVS": "новосибирск",
  KZ: "казахстан",
  "KZ-ALA": "алматы",
  BY: "беларусь",
  UA: "украина",
};

const GEO_PRICE_SUFFIXES = ["цена", "стоимость"] as const;

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

export function isCommercialKeyword(
  phrase: string,
  intent?: KeywordIntent,
): boolean {
  const p = phrase.toLowerCase();
  if (intent === "navigational") {
    return false;
  }
  if (NON_COMMERCIAL_MARKERS.some((marker) => p.includes(marker))) {
    return false;
  }
  if (intent === "hot") {
    return true;
  }
  if (COMMERCIAL_TRIGGERS.some((marker) => p.includes(marker))) {
    return true;
  }
  return false;
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

/** Код гео из брифа → слово для слитных коммерческих масок. */
export function geoLabelFromBriefCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  if (GEO_LABELS[normalized]) {
    return GEO_LABELS[normalized];
  }
  const tail = normalized.split("-").pop()?.toLowerCase();
  if (!tail || tail.length < 3) return null;
  return tail;
}

/** Слитные гео+цена маски: «{услуга} {город} цена», «купить {услуга} {город}». */
export function combinedGeoCommercialMasks(
  servicePhrases: string[],
  geo: string[],
): string[] {
  const cities = [
    ...new Set(
      geo
        .map((code) => geoLabelFromBriefCode(code))
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (cities.length === 0) {
    return [];
  }
  const services = [
    ...new Set(
      servicePhrases
        .map((item) => normalizeMask(item))
        .filter((item) => item.length >= 3),
    ),
  ];
  const masks: string[] = [];
  for (const service of services) {
    for (const city of cities) {
      for (const suffix of GEO_PRICE_SUFFIXES) {
        masks.push(`${service} ${city} ${suffix}`);
      }
      masks.push(`купить ${service} ${city}`);
    }
  }
  return masks;
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
  const serviceSeeds = [
    ...brief.usp,
    ...brief.usp.flatMap((usp) => deriveMasksFromUsp(usp)),
  ];
  for (const combined of combinedGeoCommercialMasks(serviceSeeds, brief.geo)) {
    push(combined);
  }
  if (brief.product_description) {
    push(brief.product_description.split(/[.!]/)[0] ?? "");
  }
  for (const token of landingText.split(/[\s,.;:]+/)) {
    if (token.length > 5) {
      push(token);
    }
  }

  return Array.from(new Set(masks)).slice(0, 30);
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
