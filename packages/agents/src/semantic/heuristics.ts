import {
  KeywordIdea,
  KeywordIntent,
  SemanticBriefInput,
  SuggestedNegativeSource,
  SuggestedNegativeWord,
} from "./types";

/** Сервисные токены — не коммерческое ядро даже если Wordstat их подсунул. */
const SERVICE_NEGATIVE_TOKENS = ["ремонт"];

/** Стоп-слова для минус-токенов из Planner (не несут минус-смысла сами по себе). */
const NEGATIVE_TOKEN_STOPWORDS = new Set([
  "для",
  "или",
  "при",
  "как",
  "это",
  "все",
  "без",
  "под",
  "над",
  "про",
  "чем",
  "что",
  "где",
  "кто",
  "ваш",
  "моя",
  "мой",
  "наши",
  "алматы",
  "москва",
  "казахстан",
  "россия",
]);

/** Продуктовые/сервисные токены — нельзя предлагать как «мусорные» минусы. */
const PRODUCT_OR_SERVICE_NEGATIVE_BLOCK = new Set([
  "кондиционер",
  "кондиционеры",
  "кондиционера",
  "кондиционеров",
  "кондиционерами",
  "кондер",
  "кондеры",
  "сплит",
  "система",
  "системы",
  "систем",
  "установка",
  "установки",
  "установку",
  "установщики",
  "монтаж",
  "монтажа",
  "монтажом",
  "купить",
  "куплю",
  "продам",
  "продажа",
  "заказать",
  "цена",
  "цены",
  "стоимость",
  "доставка",
  "наличие",
  "ремонт",
  "починка",
  "сервис",
  "заправка",
  "мойка",
  "чистка",
]);

const HVAC_FAMILIES = new Set([
  "family:conditioner",
  "family:conder",
  "family:split_system",
  "family:vrf",
]);

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

const INSTALL_MARKERS = [
  "установка",
  "установки",
  "установку",
  "установить",
  "монтаж",
  "монтажа",
  "монтажу",
  "монтажом",
  "смонтировать",
] as const;

const REPAIR_MARKERS = ["ремонт", "ремонта", "починить", "починка"] as const;
const REFILL_MARKERS = [
  "заправка",
  "заправки",
  "дозаправка",
  "фреон",
] as const;
const CLEAN_MARKERS = ["мойка", "мойки", "чистка", "чистки", "почистить"] as const;

export type ClusteringServiceType =
  | "purchase"
  | "install"
  | "repair"
  | "refill"
  | "clean"
  | "product";

/** Тип услуги в запросе — жёсткая перегородка кластеров. */
export function serviceTypeFromPhrase(phrase: string): ClusteringServiceType {
  const p = normalizeMask(phrase);
  if (INSTALL_MARKERS.some((marker) => p.includes(marker))) {
    return "install";
  }
  if (REFILL_MARKERS.some((marker) => p.includes(marker))) {
    return "refill";
  }
  if (CLEAN_MARKERS.some((marker) => p.includes(marker))) {
    return "clean";
  }
  if (REPAIR_MARKERS.some((marker) => p.includes(marker))) {
    return "repair";
  }
  if (
    HOT_MARKERS.some((marker) => p.includes(marker)) ||
    COMMERCIAL_TRIGGERS.some((marker) => p.includes(marker))
  ) {
    return "purchase";
  }
  return "product";
}

/**
 * Продуктовое семейство фразы: сплит / кондер / кондиционер / SKU / ядро бренда.
 * Кластер одной семьи не смешивается с другой.
 */
export function productFamilyFromPhrase(phrase: string): string {
  const normalized = normalizeMask(phrase);
  if (/сплит[-\s]?систем/u.test(normalized)) {
    return "family:split_system";
  }
  // «кондер» / «кондеры», но не «кондиционер…»
  if (/(^|[^\p{L}])кондер(?!ицион)\p{L}*/u.test(normalized)) {
    return "family:conder";
  }
  if (/кондиционер/u.test(normalized)) {
    return "family:conditioner";
  }
  if (/(^|\s)vrf(\s|$)/u.test(normalized)) {
    return "family:vrf";
  }

  const core = phraseClusteringCore(phrase);
  const tokens = tokenize(core).filter(
    (token) =>
      !NEGATIVE_TOKEN_STOPWORDS.has(token) &&
      !INSTALL_MARKERS.includes(token as (typeof INSTALL_MARKERS)[number]) &&
      !REPAIR_MARKERS.includes(token as (typeof REPAIR_MARKERS)[number]) &&
      !HOT_MARKERS.includes(token) &&
      !COMMERCIAL_TRIGGERS.includes(
        token as (typeof COMMERCIAL_TRIGGERS)[number],
      ),
  );
  const sku = tokens.find((token) => /\d/.test(token) && token.length >= 4);
  if (sku) {
    return `sku:${sku}`;
  }
  if (tokens.length === 0) {
    return "family:other";
  }
  const top = [...tokens].sort((a, b) => b.length - a.length).slice(0, 2);
  return `core:${top.join("+")}`;
}

/** Ключ жёсткой перегородки до cosine-кластеризации. */
export function clusteringPartitionKey(phrase: string): string {
  let service = serviceTypeFromPhrase(phrase);
  // Голый продукт («сплит система») держим с покупкой, не с монтажом.
  if (service === "product") {
    service = "purchase";
  }
  return `${service}|${productFamilyFromPhrase(phrase)}`;
}

/** Токены ниши из УТП / описания — для отсечения чужих тематик. */
export function nicheCoreTokens(brief: SemanticBriefInput): Set<string> {
  const blob = [...brief.usp, brief.product_description ?? ""]
    .join(" ")
    .toLowerCase();
  const tokens = new Set(
    tokenize(blob).filter(
      (token) =>
        token.length > 2 &&
        !NEGATIVE_TOKEN_STOPWORDS.has(token) &&
        !HOT_MARKERS.includes(token),
    ),
  );
  const hvac =
    [...tokens].some((token) =>
      /кондиц|кондер|сплит|vrf|монтаж|установ/u.test(token),
    ) || /кондиц|кондер|сплит|vrf/u.test(blob);
  if (hvac) {
    for (const token of [
      "кондиционер",
      "кондиционера",
      "кондиционеров",
      "кондиционеры",
      "кондер",
      "кондеры",
      "сплит",
      "система",
      "системы",
      "vrf",
      "samsung",
      "lg",
      "gree",
      "midea",
      "мидеа",
      "electrolux",
    ]) {
      tokens.add(token);
    }
  }
  return tokens;
}

/** Фраза по ниши брифа (отсев «гинекология москва», «шторы» и т.п.). */
export function isPhraseOnNiche(
  phrase: string,
  brief: SemanticBriefInput,
): boolean {
  const niche = nicheCoreTokens(brief);
  if (niche.size === 0) {
    return true;
  }
  const tokens = tokenize(phrase);
  if (tokens.some((token) => niche.has(token))) {
    return true;
  }
  const family = productFamilyFromPhrase(phrase);
  const briefFamilies = new Set(
    [...brief.usp, brief.product_description ?? ""].map((item) =>
      productFamilyFromPhrase(item),
    ),
  );
  const nicheIsHvac = [...briefFamilies].some((item) => HVAC_FAMILIES.has(item))
    || [...niche].some((token) => /кондиц|кондер|сплит|vrf/u.test(token));
  if (nicheIsHvac && HVAC_FAMILIES.has(family)) {
    return true;
  }
  if (family.startsWith("sku:") && tokens.some((token) => niche.has(token))) {
    return true;
  }
  // Артикул рядом с нишевым брендом уже покрыт; голый SKU без бренда — нет.
  return false;
}

/**
 * Минус безопасен, только если не пересекается с коммерческим/продуктовым ядром.
 */
export function isSafeNegativePhrase(
  phrase: string,
  protectedPhrases: string[],
): boolean {
  return (
    filterNegativesAgainstCommercialCore(
      [
        {
          phrase,
          reason: "check",
          source: "llm_negative_words",
        },
      ],
      protectedPhrases,
    ).length > 0
  );
}

/** Вычистить из брифа минусы, которые режут ядро ниши. */
export function sanitizeBriefNegatives(
  negatives: string[],
  brief: Pick<
    SemanticBriefInput,
    "usp" | "product_description" | "forbidden_phrases"
  >,
): string[] {
  const protectedPhrases = [
    ...brief.usp,
    brief.product_description ?? "",
    ...(brief.forbidden_phrases ?? []),
  ].filter(Boolean);
  // Защищаем и типовые коммерческие/товарные токены ниши.
  const extra = [...nicheCoreTokens({
    geo: [],
    usp: brief.usp,
    target_audience: [],
    global_negative_keywords: [],
    product_description: brief.product_description,
  })];
  return negatives.filter((item) =>
    isSafeNegativePhrase(item, [...protectedPhrases, ...extra]),
  );
}

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

/**
 * Если фраза начинается и заканчивается одним и тем же коммерческим триггером
 * (не обязательно подряд) — оставляем только в начале.
 * Пример: «заказать выезд … заказать» → «заказать выезд …».
 */
export function dropDuplicateBoundaryTrigger(phrase: string): string {
  const tokens = normalizeMask(phrase).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return tokens.join(" ");
  }
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (
    first === last &&
    (COMMERCIAL_TRIGGERS as readonly string[]).includes(first)
  ) {
    return tokens.slice(0, -1).join(" ");
  }
  return tokens.join(" ");
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
    const serviceTokens = service.split(/\s+/).filter(Boolean);
    const longUninflected = serviceTokens.length > 4;
    for (const city of cities) {
      if (longUninflected) {
        // Длинные УТП без падежного согласования: не клеим «… москва цена».
        masks.push(`стоимость ${service} в ${city}`);
      } else {
        for (const suffix of GEO_PRICE_SUFFIXES) {
          masks.push(`${service} ${city} ${suffix}`);
        }
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
    const phrase = dropDuplicateBoundaryTrigger(
      collapseConsecutiveDuplicateTokens(idea.phrase),
    );
    if (!phrase || seen.has(phrase)) {
      continue;
    }
    if (phraseMatchesNegatives(phrase, blocked)) {
      continue;
    }
    // Align with finalizeStep (freq>0). Competition may be absent on limited API access.
    if (!(idea.frequency > 0)) {
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

const PLANNER_IDEA_SOURCES = new Set([
  "google_keyword_planner",
  "mock_wordstat",
]);

/**
 * Минус-кандидаты из Planner/Wordstat: ненулевая частотность, не коммерция.
 * Сначала целые ненужные фразы, затем токены (без продуктового/сервисного ядра).
 */
export function noncommercialPlannerNegativeCandidates(
  ideas: KeywordIdea[],
  options?: { alreadyBlocked?: string[] },
): SuggestedNegativeWord[] {
  const planner = ideas.filter(
    (idea) => PLANNER_IDEA_SOURCES.has(idea.source) && idea.frequency > 0,
  );
  const commercial = planner.filter((idea) =>
    isCommercialKeyword(idea.phrase),
  );
  const noncommercial = planner.filter(
    (idea) => !isCommercialKeyword(idea.phrase),
  );
  const commercialTokens = new Set(
    commercial.flatMap((idea) => tokenize(idea.phrase)),
  );
  const blocked = new Set(
    (options?.alreadyBlocked ?? [])
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const result: SuggestedNegativeWord[] = [];

  const pushCandidate = (phrase: string, reason: string) => {
    const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized || normalized.length < 2) return;
    if (/\d/.test(normalized)) return;
    if (blocked.has(normalized) || seen.has(normalized)) return;
    if (PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(normalized)) return;
    const tokens = tokenize(normalized);
    if (tokens.some((token) => commercialTokens.has(token))) return;
    if (tokens.some((token) => PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(token))) {
      return;
    }
    seen.add(normalized);
    result.push({
      phrase: normalized,
      reason,
      source: "keyword_planner_noncommercial",
    });
  };

  for (const idea of noncommercial) {
    const phrase = normalizeMask(idea.phrase);
    const tokens = tokenize(phrase);
    // Многословный мусор целиком («своими руками», «мастер класс»).
    if (tokens.length >= 2) {
      pushCandidate(
        phrase,
        `некоммерческий запрос «${idea.phrase}» (частотность ${idea.frequency})`,
      );
    }
    for (const token of tokens) {
      if (NEGATIVE_TOKEN_STOPWORDS.has(token)) continue;
      if (/\d/.test(token)) continue;
      if (commercialTokens.has(token) || blocked.has(token) || seen.has(token)) {
        continue;
      }
      pushCandidate(
        token,
        `некоммерческий запрос «${idea.phrase}» (частотность ${idea.frequency})`,
      );
    }
  }
  return result;
}

/** Другой кластер/фраза → минус, если другое продуктовое семейство или другая услуга. */
export function shouldCrossMinusPhrase(
  targetService: ClusteringServiceType,
  targetFamily: string,
  otherPhrase: string,
): boolean {
  const otherService = serviceTypeFromPhrase(otherPhrase);
  const otherFamily = productFamilyFromPhrase(otherPhrase);
  if (targetFamily !== otherFamily) {
    if (
      targetFamily === "family:other" &&
      otherFamily === "family:other"
    ) {
      return false;
    }
    return true;
  }
  if (
    targetService !== otherService &&
    targetService !== "product" &&
    otherService !== "product"
  ) {
    return true;
  }
  return false;
}

export function dominantClusterPartition(
  phrases: string[],
): { service: ClusteringServiceType; family: string } {
  const services = new Map<ClusteringServiceType, number>();
  const families = new Map<string, number>();
  for (const phrase of phrases) {
    const service = serviceTypeFromPhrase(phrase);
    const family = productFamilyFromPhrase(phrase);
    services.set(service, (services.get(service) ?? 0) + 1);
    families.set(family, (families.get(family) ?? 0) + 1);
  }
  const service =
    [...services.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "product";
  const family =
    [...families.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "family:other";
  return { service, family };
}

/** Убрать предложения, пересекающиеся с коммерческим ядром (фраза или любой токен). */
export function filterNegativesAgainstCommercialCore(
  suggestions: SuggestedNegativeWord[],
  commercialPhrases: string[],
): SuggestedNegativeWord[] {
  const corePhrases = new Set(
    commercialPhrases
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, " "))
      .filter(Boolean),
  );
  const coreTokens = new Set(
    commercialPhrases.flatMap((phrase) => tokenize(phrase)),
  );
  return suggestions.filter((item) => {
    const phrase = item.phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!phrase || corePhrases.has(phrase)) {
      return false;
    }
    if (/\d/.test(phrase)) {
      return false;
    }
    if (PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(phrase)) {
      return false;
    }
    const tokens = tokenize(phrase);
    if (tokens.length === 0) {
      return phrase.length >= 2 && !coreTokens.has(phrase);
    }
    // Любой токен из ядра (УТП / коммерция) — нельзя в минусы.
    if (tokens.some((token) => coreTokens.has(token))) {
      return false;
    }
    if (tokens.some((token) => PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(token))) {
      return false;
    }
    return true;
  });
}

export function mergeSuggestedNegativeWords(
  ...lists: SuggestedNegativeWord[][]
): SuggestedNegativeWord[] {
  const seen = new Set<string>();
  const merged: SuggestedNegativeWord[] = [];
  for (const list of lists) {
    for (const item of list) {
      const phrase = item.phrase.trim().toLowerCase().replace(/\s+/g, " ");
      if (!phrase || phrase.length < 2 || seen.has(phrase)) {
        continue;
      }
      seen.add(phrase);
      merged.push({
        phrase,
        reason: item.reason.trim() || "нецелевой интент",
        source: item.source,
      });
    }
  }
  return merged;
}

export function normalizeNegativeSource(
  raw: string | undefined,
): SuggestedNegativeSource {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "keyword_planner_noncommercial") {
    return "keyword_planner_noncommercial";
  }
  if (
    value === "llm_niche_antonym" ||
    value === "niche_antonym" ||
    value === "antonym"
  ) {
    return "llm_niche_antonym";
  }
  return "llm_negative_words";
}
