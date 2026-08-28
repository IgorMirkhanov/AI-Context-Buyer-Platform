# Роадмап: факт-лог реализации (этапы 0–17)

Это не план «что делать дальше», а зафиксированное состояние репозитория.
Нумерованные этапы **0–17 выполнены**. Следующий этап не начинать, пока его
явно не запросят отдельной задачей.

Источники (ветка `master` на момент сверки **не содержала коммитов** —
`git log` пуст). Состав этапов восстановлен по:

- миграциям Prisma `apps/api/prisma/migrations/` (даты `20260827`–`20260828`);
- контроллерам NestJS `apps/api/src/**/*.controller.ts`;
- транскриптам агентных сессий (нумерация UI «Этап N» и закрывающие резюме).

Публикация кампаний по-прежнему **только из UI**, без автопубликации
оркестратором, очередью или автопилотом.

---

## Этап 0 — Каркас

Монорепо: `apps/api` (NestJS), `apps/web` (Next.js), пакеты `connectors` /
`agents` / `shared-types`. Docker Compose (`postgres`, `redis`, опционально
`api`). JWT-регистрация/логин. CI: линт + Jest.

**Таблицы:** `organizations`, `users`, `projects`  
(`20260827000000_init`). Поле `organizations.plan` есть (`default 'free'`),
логики тарифов нет.

**API:** `GET /health`, `POST /auth/register`, `POST /auth/login`,
`GET /auth/me`.

---

## Этап 1 — Онбординг проекта и OAuth (Яндекс Директ)

Создание проекта вместе с брифом, AES-шифрование токенов, OAuth Яндекса
через `YandexDirectConnector`. UI: форма брифа, «Подключить Яндекс Директ»,
«Отключить аккаунт».

**Таблицы:** `ad_platform_credentials`, `project_briefs`
(`20260827120000_credentials_and_briefs`).

**API:** `GET|POST /projects`, `GET /projects/:id`,
`POST /projects/:id/oauth/yandex`, `POST /projects/:id/disconnect`,
`GET /oauth/yandex/callback`.

---

## Этап 2 — Semantic Agent

Пайплайн масок → идеи ключей (мок Wordstat через Connector) → интент →
кластеры (hash-эмбеддинги). Экспорт CSV/XLSX. Таблица `llm_call_logs`
заведена здесь же (запись вызовов), UI сводки — на этапе 17.

**Таблицы:** `semantic_clusters`, `semantic_keywords`, `agent_tasks`,
`llm_call_logs`, `keyword_embeddings` (`20260827140000_semantic_agent`).

**API:** `POST /projects/:id/semantic/run`, `GET /projects/:id/semantic`,
`GET /projects/:id/semantic/export`.

---

## Этап 3 — Copywriting + Validation

Генерация объявлений по кластерам, лимиты платформ в БД (не хардкод),
правки текстов в UI, `validation_issues` (critical/warning, auto-fix).

**Таблицы:** `platform_limits`, `ad_creatives`, `validation_issues`
(`20260827150000_copywriting_validation`).

**API:** `POST /projects/:id/creatives/run`, `GET /projects/:id/creatives`,
`PATCH /projects/:id/creatives/:creativeId`.

---

## Этап 4 — Campaign Builder + запуск на паузе

Детерминированная сборка `campaign_drafts.structure_json`. Push в кабинет
только после чекбокса в UI; кампания создаётся **paused**. Живой API
Яндекса — `LiveYandexDirectApi`; локально/CI — `YANDEX_DIRECT_MOCK=1`.

**Таблицы:** `campaign_drafts`, `campaigns`
(`20260827160000_campaign_builder`).

**API:** `POST|GET /projects/:id/campaigns`, `POST|PATCH /projects/:id/campaigns/draft`,
`POST /projects/:id/campaigns/publish`.

---

## Этап 5 — Reporting

Снимки `performance_snapshots` через `getPerformance`. Reporting Agent
даёт KPI и текстовые insights, сравнение с `target_cpl`. Поллер
`PERFORMANCE_POLL_MS` (0 = выкл.).

**Таблицы:** `performance_snapshots` (`20260827170000_performance_snapshots`).

**API:** `GET /projects/:id/reports`, `POST /projects/:id/reports/collect`.

---

## Этап 6 — Google Ads (второй коннектор)

Тот же `AdPlatformConnector`: `GoogleAdsConnector` + OAuth Google,
мок `GOOGLE_ADS_MOCK`. Агенты не импортируют SDK. Кампания в Google —
статус PAUSED. Отдельной миграции нет: `AdPlatform.google_ads` был в init.

**API:** `POST /projects/:id/oauth/google`, `GET /oauth/google-ads/callback`.

---

## Этап 7 — Optimization Agent

Рекомендации pause / reduce_budget / add_negative по статистике и search
terms. Состояния: proposed → approve/reject → apply в кабинет. Автопилот
на этом этапе ещё выключен.

**Таблицы:** `optimization_recommendations`
(`20260827180000_optimization_agent`).

**API:** `GET|POST /projects/:id/optimization`,
`POST .../optimization/:recId/approve|reject|apply`.

---

## Этап 8 — CRM и сквозная аналитика

`AttributionConnector`: Bitrix24, amoCRM, Calltouch, Roistat. Телефоны
только hash. Токен CRM шифруется, в UI не возвращается. Мок
`ATTRIBUTION_MOCK=1`.

**Таблицы:** `attribution_credentials`, `conversion_events`
(`20260827190000_attribution`).

**API:** `GET /projects/:id/attribution`,
`POST .../attribution/connect|disconnect|collect`,
`POST /attribution/inbound/:projectId`.

---

## Этап 9 — Media-генерация

`MediaGenerationConnector`: превью image/video, в кабинет не публикуются.
Утверждение/отклонение в платформе. Мок `MEDIA_MOCK=1`.

**Таблицы:** `media_assets` (`20260827200000_media_assets`).

**API:** `GET|POST /projects/:id/media`, `GET .../media/:assetId/file`,
`POST .../media/:assetId/approve|reject`.

---

## Этап 10 — White-label и субклиенты

Брендинг организации (имя, slug, лого, цвет). Роль `client`,
`project_access`. Инвайт-ссылка; клиент видит только назначенные проекты,
без записи в кабинеты (кнопки публикации/OAuth/генерации disabled).

**Таблицы:** `project_access`; поля `organizations.slug`,
`organizations.branding_json`; enum `UserRole.client`
(`20260827210000_white_label_tenancy`).

**API:** `GET /branding/:slug`, `GET /organization`,
`PATCH /organization/branding`, `GET|POST /projects/:id/access`,
`DELETE /projects/:id/access/:userId`, `POST /auth/invite`.

---

## Этап 11 — Автопилот

Opt-in на проект: порог `AUTOPILOT_GATES` (разобрано ≥3, применено ≥2,
доля ≥50%). Автопилот применяет только паузу, бюджет, минус-слова.
`createCampaign` автопилотом запрещён. Поллер `AUTOPILOT_POLL_MS`.

**Таблицы:** `projects.autopilot_enabled`, `autopilot_enabled_at`,
`optimization_recommendations.applied_by` (`20260827220000_autopilot`).

**API:** `POST /projects/:id/optimization/autopilot`.

---

## Этап 12 — Оркестратор пайплайна

Детерминированный state machine (`planPipeline`): стадии
`idle → brief_submitted → semantic_* → copy_* → awaiting_approval →
launched → live_optimizing`. LLM не выбирает следующий шаг. Кнопка
«Прогнать пайплайн до черновика» останавливается на утверждении.
Публикация в очередь не ставится. Новых таблиц нет.

**API:** `GET /projects/:id/pipeline`, `POST /projects/:id/pipeline/run`.

---

## Этап 13 — Очередь (BullMQ / inline)

Одна очередь `pipeline`, job id `pipeline:{project_id}`. Режимы
`inline | bullmq | auto`. `NODE_ENV=test` всегда inline. Если выбран
BullMQ и Redis недоступен — **нет** тихого отката на inline.
Новых таблиц нет.

Фоновые kind (этапы 13–15 расширили ту же очередь): `pipeline_run`,
`token_refresh`, `performance_collect`, `autopilot`, `ops_alerts`.

---

## Этап 14 — Ops-оповещения

Состав этапа (по миграции и резюме сессии): алерты **на project_id** —
сбой пайплайна, истечение/скоро истечение OAuth, 429 платформы. Токены в
текст алерта не попадают. «Скрыть» только ack, кампании не публикует.
Поллер `ALERTS_POLL_MS`.

**Таблицы:** `ops_alerts` (`20260827230000_ops_alerts`).

**API:** `GET /projects/:id/alerts`, `POST /projects/:id/alerts/:alertId/ack`.

---

## Этап 15 — Ротация OAuth

`refreshAccessToken` только через Connector Layer, по одному `project_id`.
Кнопка «Обновить токен»; фон `TOKEN_REFRESH_POLL_MS` (по умолчанию 0).
Неуспех → алерт `oauth_expired`. Новых таблиц нет (пишется в
`ad_platform_credentials`).

**API:** `POST /projects/:id/oauth/refresh`.

---

## Этап 16 — Журнал записей в кабинет

Аудит write-операций: actor `user | autopilot | system`, без токенов в
`summary_json`. UI: «Журнал записей в кабинет».

**Таблицы:** `ad_write_audit` (`20260827240000_ad_write_audit`).

**API:** `GET /projects/:id/audit`.

---

## Этап 17 — Расходы LLM

Сводка вызовов по `project_id`: токены, оценка USD, `promptPreview`
(секреты вырезаются, полный промпт в UI не отдаётся). KPI «LLM $» в отчёте.
Таблица `llm_call_logs` существовала с этапа 2; этап 17 — API/UI и
редакция превью.

**API:** `GET /projects/:id/llm-usage` (плюс `llmUsage` в
`GET /projects/:id/reports`).

---

## После этапа 17 (не отдельные номера роадмапа)

| Работа | Что появилось |
|--------|----------------|
| Закрытие рисков (`docs/10`) | `ProjectApiLimiter` по `{platform}:{projectId}`; `/terms` + `users.terms_accepted_at` (`20260828090000_terms_accepted`); метрика правок креативов |
| Playwright E2E | `e2e/platform.spec.ts`: 7 сценариев headless против моков; `npm run test:e2e` |

Готовность к живому клиенту — чеклист в `10_RISKS_AND_OPEN_QUESTIONS.md`,
раздел 7.

## Как пользоваться этим документом в Cursor

Не копировать промпты этапов 0–17 из `11_CURSOR_PROMPTS.md` как задание
«сделать заново». Новый код — только по явной задаче за рамками 0–17.
Архитектура и схемы: `02_ARCHITECTURE.md`, `03_DATA_MODELS.md`.
