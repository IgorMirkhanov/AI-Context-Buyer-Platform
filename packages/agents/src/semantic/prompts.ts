/** Shared semantic agent prompts (Anthropic, Groq, future OpenAI). */

export const SEMANTIC_SYSTEM =
  "Ты узкий агент семантики для контекстной рекламы. Отвечай только валидным JSON без пояснений.";

export function extractMasksUser(prompt: string): string {
  return `Извлеки до 20 поисковых масок (seed) для Wordstat по брифу. Верни JSON: {"masks":["..."]}. Бриф:\n${prompt}`;
}

export function classifyIntentsUser(prompt: string): string {
  return `Классифицируй intent каждой фразы: hot | warm | navigational. Верни JSON {"intents":["hot",...]} в том же порядке.\n${prompt}`;
}

export function nameClusterUser(prompt: string): string {
  return `Дай короткое имя кластера и category (brand|feature|geo|generic) для ключей. Имя отражает продукт И услугу, если она одна (пример: «Сплит системы — покупка», «Кондиционеры — монтаж»). JSON: {"name":"...","category":"generic"}.\n${prompt}`;
}

export function suggestNearIntentUser(prompt: string): string {
  return `По брифу и уже найденным ключам Wordstat предложи до 12 дополнительных коммерческих поисковых фраз на русском (разговорные формулировки, синонимы «цена/стоимость», глагольные CTA вроде «записаться»). Не дублируй wordstatPhrases. JSON: {"phrases":["..."]}.\n${prompt}`;
}

export function suggestFromSeedWordsUser(prompt: string): string {
  return `По брифу и вручную введённым seed-словам пользователя предложи до 15 дополнительных коммерческих поисковых фраз на русском: синонимы, смежные запросы, разговорные формулировки, варианты с «цена/стоимость/купить/заказать». Расширяй смысл seedWords, не дублируй их и existingPhrases. JSON: {"phrases":["..."]}.\n${prompt}`;
}

export function suggestNegativeWordsUser(prompt: string): string {
  return `По брифу (особенно product_description, usp, price_segment) и собранным КОММЕРЧЕСКИМ ключам предложи до 15 минус-слов или коротких минус-фраз для контекстной рекламы.

Цель: отсечь ИНФОРМАЦИОННЫЕ запросы в той же нише (обзоры, DIY, обучение, бесплатно), но НЕ резать коммерческое ядро.

Раздели предложения по полю source:
- "llm_niche_antonym" — антонимы и смежные бесплатные/DIY/карьерные/обучающие интенты, СПЕЦИФИЧНЫЕ для ниши из брифа (пример: премиум ремонт → «бесплатно», «своими руками», «мастер класс»; b2b consulting → «вакансии», «стажировка»; SEO-агентство → «курсы seo», «обучение seo»). Не копируй универсальный список — опирайся на нишу.
- "llm_negative_words" — информационные токены из той же сферы: обзор, отзывы, видео, скачать, форум, что такое, как сделать.

Запрещено предлагать (это КЛЮЧИ / ядро ниши, не минусы):
- коммерческие CTA (купить/цена/заказать/доставка/установка/монтаж);
- товар, ассортимент и категории ниши из USP/product_description и collectedKeywords (для зоомагазина: корм, кошки, собаки, животные, зоотовары, ветаптека, влажный/сухой корм, грызуны и т.п.);
- названия магазина/бренда клиента и гео клиента;
- артикулы и модели с цифрами.

В минусы только: конкуренты, вакансии, бесплатно/DIY, явный офф-ниш (не ваш товар).
Не дублируй global_negative_keywords. Предпочитай короткие минус-фразы (2–3 слова), а не обрезку коммерческого ядра.
Верни JSON: {"negatives":[{"phrase":"своими руками","reason":"DIY вместо платного ремонта","source":"llm_niche_antonym"},...]}.\n${prompt}`;
}
