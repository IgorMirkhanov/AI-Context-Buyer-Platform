import type { AnalysisBriefInput } from "./types";

export const ANALYSIS_SYSTEM =
  "Ты аналитик контекстной рекламы (Яндекс Директ / Google Ads). Отвечай на русском, структурированно, с нумерованными пунктами.";

export function analysisUserPrompt(
  brief: AnalysisBriefInput,
  landingText: string,
): string {
  return `Проанализируй сайт и бриф проекта. Объясни, что ты возьмёшь за основу для сбора семантического ядра и почему — конкретно по пунктам (аудитория, УТП, офферы и формулировки с сайта, гео, минус-слова, что исключишь).

Бриф (JSON):
${JSON.stringify(brief, null, 2)}

Текст главной страницы сайта:
${landingText || "(текст не удалось извлечь — опирайся на бриф)"}`;
}
