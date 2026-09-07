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

/** Рекламные эпитеты в УТП — не часть поискового ядра. */
const MARKETING_LEAD =
  /^(лучший|лучшая|лучшее|лучшие|качественн\w*|профессиональн\w*|над[её]жн\w*|топ)\s+/iu;

/** Услуги/B2B — «купить …» звучит неестественно; лучше «заказать». */
const SERVICE_BUY_TOKENS = new Set([
  "установка",
  "монтаж",
  "ремонт",
  "разработка",
  "разработки",
  "отдел",
  "агентство",
  "клиника",
  "студия",
  "запись",
  "услуги",
  "услуга",
  "консультация",
  "консультации",
]);

function looksBuyableProduct(service: string): boolean {
  const tokens = service.split(/\s+/).filter(Boolean);
  if (tokens.length > 3) return false;
  // \b не работает с кириллицей в JS — проверяем токены явно.
  if (
    tokens.some(
      (t) =>
        SERVICE_BUY_TOKENS.has(t) ||
        /^услуг/u.test(t) ||
        /^консультац/u.test(t),
    )
  ) {
    return false;
  }
  return true;
}

const CLUSTERING_PREFIXES = ["купить ", "заказать "];
const CLUSTERING_TAILS = [
  "официальный сайт",
  "отзывы",
  "обзор",
  "цена",
  "стоимость",
  "заказать",
];

/** УТП без маркетингового префикса → маска для Wordstat. */
export function cleanServiceMask(usp: string): string {
  let s = normalizeMask(usp);
  s = s.replace(MARKETING_LEAD, "").trim();
  return s;
}

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
  if (/уки$/u.test(token)) {
    return token.replace(/уки$/u, "ук");
  }
  if (/еты$/u.test(token)) {
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

/** Убирает подряд идущие одинаковые токены («купить купить», «цена цена»). */
export function collapseConsecutiveDuplicateTokens(phrase: string): string {
  const tokens = normalizeMask(phrase).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }
  const collapsed = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] !== collapsed[collapsed.length - 1]) {
      collapsed.push(tokens[i]);
    }
  }
  return collapsed.join(" ");
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

/** Слитные гео+цена маски: «{услуга} {город} цена», «заказать/купить {услуга} {город}». */
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
        .map((item) => cleanServiceMask(item))
        .filter((item) => item.length >= 3),
    ),
  ];
  const masks: string[] = [];
  for (const service of services) {
    for (const city of cities) {
      for (const suffix of GEO_PRICE_SUFFIXES) {
        masks.push(`${service} ${city} ${suffix}`);
      }
      if (looksBuyableProduct(service)) {
        masks.push(`купить ${service} ${city}`);
      } else {
        masks.push(`заказать ${service} ${city}`);
      }
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
    push(cleanServiceMask(usp) || usp);
    push(usp);
    for (const derived of deriveMasksFromUsp(cleanServiceMask(usp) || usp)) {
      push(derived);
    }
  }
  for (const combined of combinedGeoCommercialMasks(brief.usp, brief.geo)) {
    push(combined);
  }
  if (brief.product_description) {
    push(brief.product_description.split(/[.!]/)[0] ?? "");
  }
  // Не берём каждый токен лендинга (даёт мусор вроде «цветной», «главная»).
  // Короткие заголовки 2–4 слова — только если похожи на услугу/продукт.
  for (const phrase of servicePhrasesFromLanding(landingText, brief.usp)) {
    push(phrase);
  }

  return Array.from(new Set(masks)).slice(0, 30);
}

const LANDING_STOPWORDS = new Set([
  "главная",
  "услуги",
  "контакты",
  "онас",
  "о",
  "нас",
  "компании",
  "меню",
  "вход",
  "каталог",
  "подробнее",
  "заказать",
  "оставить",
  "заявку",
]);

/** Безопасные маски с лендинга: только фразы, пересекающиеся с УТП. */
export function servicePhrasesFromLanding(
  landingText: string,
  uspSeeds: string[] = [],
): string[] {
  if (!landingText.trim()) return [];
  const uspTokens = new Set(
    uspSeeds
      .flatMap((u) => cleanServiceMask(u).split(/\s+/))
      .filter((t) => t.length >= 3),
  );
  if (uspTokens.size === 0) return [];

  const out: string[] = [];
  const chunks = landingText.split(/[\n.!?|;]+/u);
  for (const chunk of chunks) {
    const tokens = normalizeMask(chunk)
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !LANDING_STOPWORDS.has(t));
    if (tokens.length < 2 || tokens.length > 4) continue;
    if (chunk.length > 72) continue;
    if (!tokens.some((t) => uspTokens.has(t))) continue;
    out.push(tokens.join(" "));
    if (out.length >= 6) break;
  }
  return out;
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
  const seen = new Set<string>();
  const filtered: KeywordIdea[] = [];
  for (const idea of ideas) {
    const phrase = collapseConsecutiveDuplicateTokens(idea.phrase);
    if (!phrase || seen.has(phrase)) {
      continue;
    }
    if (phraseMatchesNegatives(phrase, blocked)) {
      continue;
    }
    seen.add(phrase);
    filtered.push({ ...idea, phrase });
  }
  return filtered;
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
