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
  "almaty",
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

/** Обзорные/информационные маркеры — не коммерческие, даже при warm/hot. */
const NON_COMMERCIAL_MARKERS = [
  ...NAV_MARKERS,
  "обзор",
  "отзыв",
  "отзывы",
  "рейтинг",
  "сравнен",
  "какой",
  "лучш",
  "что такое",
  "как сделать",
  "своими руками",
  "мастер класс",
  "мастер-класс",
  "скачать",
  "бесплатно",
  "ваканс",
  "форум",
  "видео",
  "инструкция",
  "урок",
  "wiki",
  "википед",
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
  const pet =
    [...tokens].some((token) =>
      /зоо|корм|животн|питомц|вет|кошк|собак|грызун/u.test(token),
    ) || /зоо|корм|животн|питомц|ветаптек/u.test(blob);
  if (pet) {
    for (const token of PET_NICHE_CORE_TOKENS) {
      tokens.add(token);
    }
  }
  return tokens;
}

/** Ядро зоониши — нельзя класть в минусы (должно жить в ключах). */
const PET_NICHE_CORE_TOKENS = [
  "зоомагазин",
  "зоомагазина",
  "зоомагазины",
  "зоотовары",
  "зоотовар",
  "зоотоваров",
  "корм",
  "корма",
  "кормом",
  "кормами",
  "кошки",
  "кошек",
  "кошка",
  "собаки",
  "собак",
  "собака",
  "животные",
  "животных",
  "питомцы",
  "питомцев",
  "грызуны",
  "грызунов",
  "ветаптека",
  "ветаптеки",
  "ветеринар",
  "ветеринарный",
  "ветеринарные",
  "ветеринарных",
  "влажный",
  "влажного",
  "сухой",
  "сухого",
  "доставка",
  "доставкой",
  "товары",
  "товаров",
  "магазин",
  "магазина",
] as const;

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
  return negatives.filter((item) => {
    const phrase = item.trim().toLowerCase().replace(/\s+/g, " ");
    if (!phrase) return false;
    if (NEGATIVE_TOKEN_STOPWORDS.has(phrase)) return false;
    return isSafeNegativePhrase(item, [...protectedPhrases, ...extra]);
  });
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

/**
 * When Keyword Planner returns a thin set, pad with *natural* commercial
 * variants. Avoid nonsense like «купить магазин …».
 */
export function padKeywordIdeasWithCommercialVariants(
  ideas: KeywordIdea[],
  seeds: string[],
  minTotal = 8,
): KeywordIdea[] {
  // Only pad from sensible multi-word seeds — never from SKU junk.
  const safeSeeds = seeds.filter(isSensibleSearchKeyword);
  if (safeSeeds.length === 0 && ideas.length === 0) return ideas;

  const seen = new Set(
    ideas.map((item) => item.phrase.trim().toLowerCase().replace(/\s+/g, " ")),
  );
  const out: KeywordIdea[] = [...ideas];
  const bases = [
    ...safeSeeds.map((s) => s.trim().toLowerCase().replace(/\s+/g, " ")),
    ...ideas
      .filter((i) => isSensibleSearchKeyword(i.phrase))
      .map((i) => i.phrase),
  ].filter(Boolean);

  for (const base of bases) {
    if (out.length >= minTotal) break;
    for (const phrase of naturalCommercialVariants(base)) {
      if (out.length >= minTotal) break;
      const key = phrase.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key) || !isSensibleSearchKeyword(key)) continue;
      if (
        !isPublishWorthyKeyword(key, {
          frequency: 1,
          source: "seed_expand_templates",
          intent: "hot",
        })
      ) {
        continue;
      }
      seen.add(key);
      out.push({
        phrase: key,
        frequency: 1,
        competition: null,
        source: "seed_expand_templates",
      });
    }
  }
  return out;
}

const GEO_TOKEN_RE =
  /(?:^|\s)(?:в\s+)?(алматы|алмата|астана|нур.?султан|москва|спб|питер|казахстан|россия|almaty)(?=\s|$)/gu;

function stripGeoTokens(phrase: string): string {
  return phrase
    .replace(GEO_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/(?:^|\s)в$/u, "")
    .trim();
}

function hasGeoToken(phrase: string): boolean {
  GEO_TOKEN_RE.lastIndex = 0;
  return GEO_TOKEN_RE.test(phrase);
}

/** Nouns that must not get a leading «купить». */
const PLACE_OR_CHANNEL =
  /^(магазин|зоомагазин|зоомагазин[аы]?|интернет[\s-]?магазин|сайт|каталог|склад|аптека|ветаптека)(?:\s|$)/u;

/** Already a price/commerce query — do not prepend «купить». */
const PRICE_OR_COMMERCE_RE =
  /(?:^|\s)(купить|заказать|записаться|стоимость|стоимости|цена|цены|цене|цену|недорого|доставка|доставкой|наличие|сколько\s+стоит|лучшие\s+цены)(?:\s|$)/u;

/**
 * Build short, speakable query variants from a seed phrase.
 */
export function naturalCommercialVariants(base: string): string[] {
  const normalized = base.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return [];
  const core = stripGeoTokens(normalized) || normalized;
  const hasGeo = hasGeoToken(normalized);
  const hasTrigger =
    seedHasCommercialTrigger(normalized) || seedHasCommercialTrigger(core);
  const isPlace = PLACE_OR_CHANNEL.test(core);

  const candidates: string[] = [normalized];
  if (core !== normalized && isSensibleSearchKeyword(core)) {
    candidates.push(core);
  }

  if (!hasTrigger && !isPlace) {
    candidates.push(`купить ${core}`);
    if (hasGeo) candidates.push(`купить ${normalized}`);
    candidates.push(`${core} цена`);
    candidates.push(`${core} заказать`);
  }

  if (isPlace) {
    if (!/\bнедорого\b/u.test(core) && !/(?:^|\s)недорого(?:\s|$)/u.test(core)) {
      candidates.push(`${core} недорого`);
    }
    if (hasGeo && !/(?:^|\s)недорого(?:\s|$)/u.test(normalized)) {
      candidates.push(`${normalized} недорого`);
    }
  } else if (!hasTrigger && !/(?:^|\s)недорого(?:\s|$)/u.test(core)) {
    candidates.push(`${core} недорого`);
  }

  if (!/доставк/u.test(core) && !isPlace && !hasTrigger) {
    candidates.push(`${core} с доставкой`);
  }

  if (!hasGeo && core.split(" ").length <= 5) {
    candidates.push(`${core} алматы`);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key) || !isSensibleSearchKeyword(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Reject template garbage that Google marks as low-volume / not serving. */
export function isSensibleSearchKeyword(phrase: string): boolean {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!p) return false;
  const words = p.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if (p.length > 70) return false;
  if (/(алматы\s+алматы|недорого\s+недорого|цена\s+цена)/u.test(p)) {
    return false;
  }
  if (/(?:^|\s)алматы(?:\s+\S+){0,4}\s+алматы(?:\s|$)/u.test(p)) {
    return false;
  }
  if (/купить\s+купить|заказать\s+заказать|заказ\s+заказать/u.test(p)) {
    return false;
  }
  // Avoid JS `\b` — it is ASCII-only and breaks on Cyrillic tokens.
  if (/^купить\s+(магазин|зоомагазин|сайт|каталог|склад)(?:\s|$)/u.test(p)) {
    return false;
  }
  if (/^купить\s+(сколько|лучшие|цена|цены)(?:\s|$)/u.test(p)) return false;
  if (/^заказать\s+(магазин|зоомагазин|сайт|сколько)(?:\s|$)/u.test(p)) {
    return false;
  }
  if (/(?:^|\s)(официальный сайт|обзор|отзывы|ремонт)(?:\s|$)/u.test(p)) {
    return false;
  }
  // Truncated geo leftovers: «… для животных в»
  if (/(?:^|\s)(в|на|по|от|до|и|или)$/u.test(p)) return false;
  // SKU / model junk: «креатив s8», «купить креатив 58»
  if (words.some((w) => /^[a-z]?\d{1,4}$/u.test(w))) {
    return false;
  }
  // Competitor / school brands leaking into agency semantics
  if (COMPETITOR_LEAK_RE.test(p)) return false;
  return true;
}

/** Education / agency competitors that must not become positive keywords. */
const COMPETITOR_LEAK_RE =
  /(?:^|\s)(skillbox|скилбокс|geekbrains|гикбрейнс|netology|нетология|otus|отус|html\s*academy|яндекс\s*практикум|yandex\s*practicum|genius\s*marketing)(?:\s|$)/iu;

const SYNTHETIC_SOURCES = new Set([
  "seed_expand_templates",
  "llm_seed_expand",
  "llm_near_intent",
  "manual_edit",
]);

const REAL_VOLUME_SOURCES = new Set([
  "google_keyword_planner",
  "mock_wordstat",
  "yandex_wordstat",
]);

/**
 * Keep only phrases that look like real commercial search demand.
 * Prefer Planner volume; drop synthetic template spam and competitor leaks.
 */
export function isPublishWorthyKeyword(
  phrase: string,
  opts?: {
    frequency?: number;
    source?: string;
    intent?: KeywordIntent;
  },
): boolean {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!isSensibleSearchKeyword(p)) return false;
  if (COMPETITOR_LEAK_RE.test(p)) return false;
  const intent = opts?.intent;
  if (intent === "navigational" || intent === "warm") return false;
  // Token match — avoid «сайт» hitting «сайтов».
  const tokens = p.split(/\s+/).filter(Boolean);
  if (
    tokens.some(
      (token) =>
        token === "сайт" ||
        token === "бренд" ||
        token === "логотип" ||
        token === "это" ||
        NON_COMMERCIAL_MARKERS.some(
          (marker) => marker.includes(" ") && p.includes(marker),
        ),
    )
  ) {
    return false;
  }
  if (tokens.some((token) => /^[a-z]?\d{1,4}$/u.test(token))) {
    return false;
  }

  const freq = opts?.frequency ?? 0;
  const source = (opts?.source ?? "").toLowerCase();
  const isSynthetic =
    SYNTHETIC_SOURCES.has(source) || source.startsWith("llm_");
  const isRealVolume =
    REAL_VOLUME_SOURCES.has(source) ||
    source.includes("planner") ||
    source.includes("wordstat");

  // Real Planner rows with volume — keep commercial or solid multi-word niche.
  if (isRealVolume && freq > 1) {
    return (
      isCommercialKeyword(p, intent) ||
      (tokens.length >= 3 && !/^[a-z0-9\s]+$/u.test(p))
    );
  }

  // Synthetic templates only if clearly commercial with real content words.
  if (isSynthetic || freq <= 1) {
    if (!isCommercialKeyword(p, intent ?? "hot")) return false;
    const content = tokens.filter(
      (w) =>
        !COMMERCIAL_TRIGGERS.includes(w as (typeof COMMERCIAL_TRIGGERS)[number]) &&
        !NEGATIVE_TOKEN_STOPWORDS.has(w) &&
        w !== "недорого" &&
        !/^[a-z]?\d{1,4}$/u.test(w),
    );
    return content.length >= 2;
  }

  return isCommercialKeyword(p, intent);
}

/**
 * Rank and cap keywords for an ad group before Google publish / draft UI.
 * Uses real search volume when present; does not flood with template variants.
 */
export function selectPublishWorthyKeywords(
  keywords: Array<{
    phrase: string;
    isNegative?: boolean;
    frequency?: number;
    source?: string;
    intent?: KeywordIntent;
  }>,
  opts?: { maxCount?: number; minCount?: number },
): string[] {
  const maxCount = opts?.maxCount ?? 12;
  const minCount = opts?.minCount ?? 2;
  const positives = keywords.filter((item) => !item.isNegative);
  const ranked = [...positives].sort((a, b) => {
    const aReal = REAL_VOLUME_SOURCES.has((a.source ?? "").toLowerCase())
      ? 1
      : 0;
    const bReal = REAL_VOLUME_SOURCES.has((b.source ?? "").toLowerCase())
      ? 1
      : 0;
    if (bReal !== aReal) return bReal - aReal;
    const freqDiff = (b.frequency ?? 0) - (a.frequency ?? 0);
    if (freqDiff !== 0) return freqDiff;
    return a.phrase.localeCompare(b.phrase, "ru");
  });

  const seen = new Set<string>();
  const out: string[] = [];

  const tryPush = (
    item: (typeof ranked)[number],
    allowSynthetic: boolean,
  ): boolean => {
    const key = item.phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    const source = (item.source ?? "").toLowerCase();
    const isSynthetic =
      SYNTHETIC_SOURCES.has(source) || source.startsWith("llm_");
    if (isSynthetic && !allowSynthetic) return false;
    if (
      !isPublishWorthyKeyword(key, {
        frequency: item.frequency,
        source: item.source,
        intent: item.intent,
      })
    ) {
      return false;
    }
    seen.add(key);
    out.push(item.phrase.trim());
    return true;
  };

  // Pass 1: real Planner / Wordstat volume only.
  for (const item of ranked) {
    if (out.length >= maxCount) break;
    tryPush(item, false);
  }
  // Pass 2: allow a few commercial synthetics only if still thin.
  if (out.length < minCount) {
    for (const item of ranked) {
      if (out.length >= maxCount) break;
      tryPush(item, true);
    }
  }

  // Pad lightly only when the group is still empty of commercial cores.
  if (out.length < minCount && out.length > 0) {
    return expandThinPublishKeywords(out, minCount, Math.min(6, maxCount));
  }
  if (out.length === 0) {
    const fallback = ranked
      .map((item) => item.phrase.trim())
      .filter((phrase) => isSensibleSearchKeyword(phrase));
    return expandThinPublishKeywords(fallback.slice(0, 3), minCount, 5);
  }
  return out;
}

/** Same commercial triggers as connectors seedHasCommercialModifier (local copy). */
function seedHasCommercialTrigger(seed: string): boolean {
  const p = seed.toLowerCase().replace(/\s+/g, " ");
  if (PRICE_OR_COMMERCE_RE.test(p)) return true;
  const tokens = p.split(/\s+/).filter(Boolean);
  return COMMERCIAL_TRIGGERS.some((trigger) => {
    if (tokens[0] === trigger) return true;
    if (tokens[tokens.length - 1] === trigger) return true;
    return tokens.includes(trigger);
  });
}

/**
 * Drop negatives that would block any of the given positive phrases
 * (token or phrase match). Also drops bare geo/stop tokens.
 */
export function sanitizeNegativesAgainstPositives(
  negatives: string[],
  positives: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const positiveTokens = new Set(positives.flatMap((pos) => tokenize(pos)));
  for (const raw of negatives) {
    const phrase = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!phrase || seen.has(phrase)) continue;
    if (NEGATIVE_TOKEN_STOPWORDS.has(phrase)) continue;
    if (HOT_MARKERS.includes(phrase)) continue;
    if (PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(phrase)) continue;
    if (positives.some((pos) => phraseMatchesNegatives(pos, [phrase]))) {
      continue;
    }
    // «магазин» must not survive next to «зоомагазин …»
    if (phrase.length >= 4) {
      const hitsCore = [...positiveTokens].some(
        (token) => token.includes(phrase) || phrase.includes(token),
      );
      if (hitsCore) continue;
    }
    seen.add(phrase);
    out.push(raw.trim());
  }
  return out;
}

/**
 * Expand a thin positive keyword list for campaign publish.
 * Keep sensible originals; pad lightly (max 6) — never flood with templates.
 */
export function expandThinPublishKeywords(
  phrases: string[],
  minCount = 2,
  maxCount = 12,
): string[] {
  const seeds = phrases
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  const sensibleSeeds = seeds.filter(isSensibleSearchKeyword);
  const base = sensibleSeeds.length > 0 ? sensibleSeeds : seeds;
  const hardCap = Math.min(maxCount, 12);
  if (base.length >= minCount) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const key of base) {
      if (!key || seen.has(key)) continue;
      if (!isSensibleSearchKeyword(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= hardCap) break;
    }
    return out.length > 0 ? out : base.slice(0, hardCap);
  }
  const ideas = padKeywordIdeasWithCommercialVariants(
    base.map((phrase) => ({
      phrase,
      frequency: 1,
      competition: null,
      source: "manual_edit",
    })),
    base,
    Math.max(minCount, base.length),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of ideas) {
    const key = item.phrase.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    if (!isSensibleSearchKeyword(key) && !base.includes(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= hardCap) break;
  }
  return out;
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
  options?: { alreadyBlocked?: string[]; brief?: SemanticBriefInput },
): SuggestedNegativeWord[] {
  const planner = ideas.filter(
    (idea) => PLANNER_IDEA_SOURCES.has(idea.source) && idea.frequency > 0,
  );
  const commercial = planner.filter((idea) =>
    isCommercialKeyword(idea.phrase),
  );
  const noncommercial = planner.filter((idea) => {
    if (isCommercialKeyword(idea.phrase)) return false;
    // Only informational queries from the same niche sphere as the brief.
    if (options?.brief && !isPhraseOnNiche(idea.phrase, options.brief)) {
      return false;
    }
    return true;
  });
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
    if ([...PET_NICHE_CORE_TOKENS].includes(phrase as (typeof PET_NICHE_CORE_TOKENS)[number])) {
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
    // Stem/substring: «зоомагазины» рядом с «зоомагазин»
    if (
      phrase.length >= 4 &&
      [...coreTokens].some(
        (token) => token.includes(phrase) || phrase.includes(token),
      )
    ) {
      return false;
    }
    if (tokens.some((token) => PRODUCT_OR_SERVICE_NEGATIVE_BLOCK.has(token))) {
      return false;
    }
    if (
      tokens.some((token) =>
        (PET_NICHE_CORE_TOKENS as readonly string[]).includes(token),
      )
    ) {
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
