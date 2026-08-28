# Интеграции с рекламными платформами

> Перед реализацией: API-платформы регулярно меняют версии, лимиты и правила
> доступа к токенам разработчика. Приведённая ниже структура — архитектурный
> план; конкретные версии эндпоинтов и лимиты нужно сверить в официальной
> документации на момент разработки, а не полагаться только на этот документ.

## 1. Яндекс Директ API v5

### 1.1 Доступ
- Регистрация приложения в Яндекс OAuth → получение `client_id` и `client_secret`.
- Авторизация пользователя по протоколу OAuth 2.0 (authorization code flow):
  пользователь нажимает "Подключить Яндекс Директ" → редирект на Яндекс →
  разрешает доступ → бот получает `code` → обменивает на `access_token`/`refresh_token`.
- Токен привязывается к конкретному рекламному аккаунту клиента (`Client-Login`
  или логин агентства при работе через агентский аккаунт).
- Для работы от имени клиентов агентства — учитывать режим "агентский аккаунт"
  с параметром `Client-Login` в заголовках запросов.

### 1.2 Основные методы, которые понадобятся
- `Campaigns.add` / `Campaigns.update` — создание/обновление кампаний.
- `AdGroups.add` — группы объявлений.
- `Ads.add` — тексты объявлений, быстрые ссылки, уточнения.
- `Keywords.add` — ключевые слова.
- `KeywordBids.set` — управление ставками.
- `AdExtensions.add` — быстрые ссылки, визитки.
- `Reports` (метод отчётов, offline reports) — статистика по кампаниям.
- `Dictionaries` — справочники регионов, минус-слов и т.д.

### 1.3 Особенности, важные для архитектуры
- Ограничение по количеству запросов в сутки/минуту зависит от статуса
  аккаунта (баллы API) — нужен троттлинг и очередь на уровне `Connector Layer`.
- Отчёты часто асинхронные (создание отчёта → ожидание → скачивание) —
  закладывать polling с бэкоффом.
- Работа с Wordstat для сбора статистики частотности — отдельный
  инструмент/API, не совпадает с основным Ads API.

## 2. Google Ads API

### 2.1 Доступ
- Создание Manager Account (MCC) в Google Ads.
- Получение **Developer Token** через MCC (требуется прохождение проверки
  Google — базовый уровень доступа выдаётся быстрее, standard/advanced —
  дольше и требует описания продукта).
- OAuth 2.0 client (`client_id`/`client_secret`) через Google Cloud Console.
- Авторизация пользователя → `refresh_token`, который используется вместе с
  `developer_token` и `login_customer_id` (ID менеджерского аккаунта) для
  всех вызовов API от лица клиентских аккаунтов.

### 2.2 Основные объекты/сервисы
- `CampaignService` — создание кампаний (Search, Performance Max, Display).
- `AdGroupService` — группы объявлений.
- `AdGroupAdService` — объявления (Responsive Search Ads и т.д.).
- `AdGroupCriterionService` — ключевые слова, минус-слова, таргетинги.
- `CampaignBudgetService` — бюджеты.
- `GoogleAdsService.search` (GAQL — Google Ads Query Language) — отчётность
  и выгрузка статистики.
- `KeywordPlanIdeaService` — получение идей ключевых слов и частотности
  (аналог Wordstat для Google).

### 2.3 Особенности, важные для архитектуры
- Все мутации идут батчами через `mutate`-методы соответствующих сервисов —
  выгодно группировать операции (создать всю структуру кампании за минимум
  запросов).
- Строгая политика по рекламным текстам (policy violations) — нужно
  закладывать обработку ошибок валидации от самого Google как дополнительный
  слой поверх собственного `Validation Agent`.
- API использует protobuf/gRPC под капотом, но есть REST-обвязка и
  официальные клиентские библиотеки (Python, Node.js, Java, .NET) — в проекте
  предпочтительно использовать официальный SDK, а не писать сырые запросы.

## 3. Единый внутренний интерфейс (Connector Layer)

```
interface AdPlatformConnector {
  authorize(projectId): OAuthUrl
  handleOAuthCallback(projectId, code): Credentials
  createCampaign(projectId, campaignDraft): ExternalCampaignId
  createAdGroups(projectId, campaignId, groups): ExternalIds[]
  createAds(projectId, adGroupId, creatives): ExternalIds[]
  addKeywords(projectId, adGroupId, keywords): void
  addNegativeKeywords(projectId, scope, negatives): void
  setBudget(projectId, campaignId, budget): void
  getPerformance(projectId, dateRange): PerformanceSnapshot[]
  getKeywordIdeas(seedKeywords, geo): KeywordIdea[]  // Wordstat / Keyword Planner
}
```

Два адаптера — `YandexDirectConnector` и `GoogleAdsConnector` — реализуют
этот интерфейс. Маршрутизация: `ConnectorRouter.forPlatform`. Агенты и
оркестратор никогда не обращаются к SDK платформ напрямую. Моки:
`YANDEX_DIRECT_MOCK`, `GOOGLE_ADS_MOCK`.

Отдельно (не `AdPlatformConnector`):

- `AttributionConnector` — Bitrix24 / amoCRM / Calltouch / Roistat
  (`ATTRIBUTION_MOCK`);
- `MediaGenerationConnector` — превью image/video (`MEDIA_MOCK`), в кабинет
  не публикуются.

## 4. Хранение и безопасность токенов

- `access_token`/`refresh_token` хранятся зашифрованными (AES-256) в отдельной
  таблице, ключ шифрования — в secret manager (не в БД и не в коде).
- Ротация `refresh_token` обрабатывается фоновым воркером до истечения срока.
- Явный механизм отзыва доступа (кнопка "Отключить аккаунт" в UI), который
  чистит токены и помечает проект как `disconnected`.
- Аудит-лог всех операций записи в рекламные кабинеты (кто/что/когда создал
  или изменил) — обязателен для агентства, которое работает от лица клиентов.
