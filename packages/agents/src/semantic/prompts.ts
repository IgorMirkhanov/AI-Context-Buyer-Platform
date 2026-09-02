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
  return `Дай короткое имя кластера и category (brand|feature|geo|generic) для ключей. JSON: {"name":"...","category":"generic"}.\n${prompt}`;
}

export function suggestNearIntentUser(prompt: string): string {
  return `По брифу и уже найденным ключам Wordstat предложи до 12 дополнительных коммерческих поисковых фраз на русском (разговорные формулировки, синонимы «цена/стоимость», глагольные CTA вроде «записаться»). Не дублируй wordstatPhrases. JSON: {"phrases":["..."]}.\n${prompt}`;
}

export function suggestFromSeedWordsUser(prompt: string): string {
  return `По брифу и вручную введённым seed-словам пользователя предложи до 15 дополнительных коммерческих поисковых фраз на русском: синонимы, смежные запросы, разговорные формулировки, варианты с «цена/стоимость/купить/заказать». Расширяй смысл seedWords, не дублируй их и existingPhrases. JSON: {"phrases":["..."]}.\n${prompt}`;
}

export function suggestNegativeWordsUser(prompt: string): string {
  return `По брифу и собранным ключам предложи до 15 минус-слов или коротких минус-фраз для контекстной рекламы — специфичных для ниши, не универсальных («бесплатно», «вакансия» уже в брифе). Ищи в collectedKeywords и brief признаки нецелевого интента: DIY, обучение, развлечения, самолечение, скачать, видео, «своими руками», отзывы/обзоры как минус-токены. Не предлагай коммерческие CTA и не дублируй global_negative_keywords. Верни JSON: {"negatives":[{"phrase":"самолечение","reason":"информационный запрос, не услуга клиники"},...]}.\n${prompt}`;
}
