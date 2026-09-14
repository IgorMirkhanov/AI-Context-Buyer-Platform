export function isNetworkFetchError(message: string): boolean {
  return (
    /failed to fetch/i.test(message) ||
    /networkerror/i.test(message) ||
    /network request failed/i.test(message) ||
    /load failed/i.test(message)
  );
}

export function localizeApiError(message: string): string {
  if (!message) return "Неизвестная ошибка";

  if (isNetworkFetchError(message)) {
    return "Не удалось связаться с сервером. Подождите несколько секунд и нажмите «Повторить». Если ошибка не исчезает — запустите API: npm run dev:api";
  }

  if (
    message === "Publish a campaign first" ||
    message.includes("опубликуйте кампанию")
  ) {
    return "Сначала опубликуйте кампанию на вкладке «Кампания». Кабинет уже подключён — статистика появится после запуска.";
  }

  if (message === "Collect performance snapshots first") {
    return "Сначала обновите статистику на вкладке «Аналитика» — нужны снимки из рекламного кабинета.";
  }

  if (
    /data\/clusters must NOT have fewer than 1 items/i.test(message) ||
    /Семантика пустая/i.test(message)
  ) {
    return (
      "Семантика пустая: Google Keyword Planner не вернул фразы (или всё срезали минус-слова). " +
      "Сохраните бриф без минусов по ядру ниши, нажмите «Обновить токен», " +
      "затем снова «Прогнать пайплайн». Для локальной проверки — GOOGLE_ADS_MOCK=1."
    );
  }

  if (
    message === "LLM spend cap reached" ||
    /LLM spend cap reached/i.test(message)
  ) {
    return (
      "Достигнут месячный лимит расходов на ИИ. " +
      "Увеличьте лимит в «Настройки → ИИ-провайдер» или дождитесь следующего месяца."
    );
  }

  if (/Copywriting pipeline failed/i.test(message)) {
    return (
      "Объявления не сохранились (часто из‑за большого числа кластеров). " +
      "Обновите страницу и снова нажмите «Прогнать пайплайн до черновика»."
    );
  }

  if (/Request contains an invalid argument/i.test(message)) {
    if (/IMMUTABLE_FIELD|operations\.create\.negative/i.test(message)) {
      return (
        "Google Ads отклонил минус-слова: часть фраз уже добавлена как плюс-ключи " +
        "(поле negative нельзя менять). Пересечение убрано в API — повторите публикацию."
      );
    }
    return (
      "Google Ads отклонил создание кампании (неверный аргумент). " +
      "Обновите API и повторите публикацию; если снова ошибка — проверьте бюджет/валюту кабинета."
    );
  }

  return message;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return localizeApiError(err.message);
  }
  return fallback;
}
