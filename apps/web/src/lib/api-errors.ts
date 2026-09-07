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

  return message;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return localizeApiError(err.message);
  }
  return fallback;
}
