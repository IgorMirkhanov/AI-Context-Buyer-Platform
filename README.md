# AI Context-Buyer Platform

Мультиагентная SaaS-платформа для полного цикла работы контекстолога
(Яндекс Директ + Google Ads). Документация — в `/docs`.

**Текущее состояние: этапы 0–17 закрыты** (`docs/07_ROADMAP_MVP.md`).
Сводка LLM по `project_id` без полного промпта в UI. Публикация — только из UI.
Биллинг `organizations.plan` **не реализован** (открытый пробел).
Чеклист живого клиента: `docs/10_RISKS_AND_OPEN_QUESTIONS.md`, раздел 7.
Чеклист продакшен-деплоя: `docs/14_PRODUCTION_DEPLOY.md` (секреты, OAuth redirect,
BullMQ, миграции, mocks, `/health`).

## Стек

- TypeScript, NestJS (`apps/api`), Next.js (`apps/web`)
- Postgres + Prisma, Redis
- npm workspaces-монорепо

## Как запустить локально

1. Скопировать переменные окружения:

```bash
cp .env.example .env
```

На Windows PowerShell: `Copy-Item .env.example .env`

Задайте `JWT_SECRET` (≥32 символов, не плейсхолдер) и
`TOKEN_ENCRYPTION_KEY` (ровно 32 байта: 64 hex или base64). API **не
стартует**, если секреты пустые, короткие или с дефолтом
`change-me-in-production`. Не коммитьте `.env`.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # TOKEN_ENCRYPTION_KEY
```

Если на машине уже занят порт `5432` (локальный Postgres), в `.env` смените
`POSTGRES_PORT` и порт в `DATABASE_URL` (например `5433`).

2. Поднять Postgres и Redis:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up postgres redis -d
```

Чтобы поднять ещё и API-контейнер:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up --build -d
```

3. Установить зависимости и применить миграции (если API запускаете не из Docker):

```bash
npm install
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run dev:api
```

В другом терминале:

```bash
npm run dev:web
```

- API: http://localhost:3001/health
- Web: http://localhost:3000

### Очередь фоновых задач (BullMQ)

**Production:** `PIPELINE_QUEUE=bullmq` и рабочий `REDIS_URL`. Не используйте
`auto` или `inline` на проде — `auto` без Redis тихо уйдёт в inline
(один процесс, без переживания нескольких воркеров).

Локально: `PIPELINE_QUEUE=auto` (значение в `.env.example`) — при заданном
`REDIS_URL` вне тестов используется BullMQ. `NODE_ENV=test` всегда `inline`.
Явный `inline` — работа без Redis (только dev/E2E).

Через одну очередь (`pipeline` в Redis) идут:

- прогон оркестратора (`pipeline:{project_id}`)
- `TOKEN_REFRESH_POLL_MS` → job `token_refresh`
- `PERFORMANCE_POLL_MS` → job `performance_collect`
- `AUTOPILOT_POLL_MS` → job `autopilot`
- `ALERTS_POLL_MS` → job `ops_alerts`

Интервал `0` отключает соответствующий job. Если выбран BullMQ, а Redis
недоступен, задачи **не** исполняются inline — поднимите Redis или
переключитесь на `PIPELINE_QUEUE=inline`.

Watch-режим API (`npm run dev:api`): процесс закрывает HTTP-сервер по
SIGTERM (`enableShutdownHooks`). Если Windows на перезапуске кратко
держит порт `3001`, listen повторяется, а не оставляется «зомби» с
таймерами. `deleteOutDir` в watch выключен, чтобы не конфликтовать с
уже запущенным `node dist/main`.

## Частые проблемы окружения

### `DATABASE_URL` при запуске Prisma из корня

Схема лежит в `apps/api/prisma/schema.prisma`, корневой `.env` Prisma
из workspace `api` сама не подхватывает. `npm run db:migrate` без
переменной падает с `Environment variable not found: DATABASE_URL`.

Из корня:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma migrate status --schema apps/api/prisma/schema.prisma
```

PowerShell (подставить URL из корневого `.env`):

```powershell
$env:DATABASE_URL = "postgresql://context:context@localhost:5433/context_buyer?schema=public"
npx prisma migrate dev --schema apps/api/prisma/schema.prisma
```

Либо скопировать `.env` в `apps/api/.env`. Не коммитьте его.

### Prisma EPERM на Windows

`prisma generate` / `migrate` трогает `query_engine-windows.dll.node`.
Если в это время запущен `npm run dev:api`, Windows отвечает `EPERM`.

Обходной путь:

1. Остановить API (Ctrl+C в терминале `dev:api`), затем
   `npm run db:generate` / `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
2. Либо выполнять Prisma внутри Linux: WSL2 в каталоге репозитория или
   `docker compose --env-file .env -f infra/docker-compose.yml run --rm api npx prisma migrate deploy`.
   Так движок не блокируется Windows-процессом Nest.

Не запускайте второй `dev:api` параллельно — порт `3001` займёт первый
процесс.

Регистрация создаёт организацию и пользователя-owner. После входа можно
создать проект с брифом, выбрать Яндекс Директ или Google Ads и нажать
«Подключить …». Для реального OAuth заполните `YANDEX_CLIENT_ID` /
`YANDEX_CLIENT_SECRET` или `GOOGLE_ADS_CLIENT_ID` /
`GOOGLE_ADS_CLIENT_SECRET` / `GOOGLE_ADS_DEVELOPER_TOKEN`, плюс
`TOKEN_ENCRYPTION_KEY` (64 hex-символа) в `.env`. API валидирует формат при старте.

Для записи в кабинет (Этап 4) укажите `YANDEX_DIRECT_API_URL`. Песочница:
`https://api-sandbox.direct.yandex.com/json/v5`. Локально без кабинета:
`YANDEX_DIRECT_MOCK=1` и/или `GOOGLE_ADS_MOCK=1`. Для CRM — `ATTRIBUTION_MOCK=1`.
Для картинок/видео без OpenAI — `MEDIA_MOCK=1` (по умолчанию в `.env.example`).

Кампания в Google Ads создаётся в статусе **PAUSED**. Customer id берётся из
`listAccessibleCustomers` или `GOOGLE_ADS_LOGIN_CUSTOMER_ID` и хранится в
`externalAccountId` (поле `clientLogin` в `PlatformAuth`).

### Ручной прогон Connector на тестовом аккаунте (перед мержем)

1. Приложение в Яндекс OAuth с правами Директа, токен на **тестовый** логин.
2. `YANDEX_DIRECT_API_URL=https://api-sandbox.direct.yandex.com/json/v5`
   (или боевой API тестового аккаунта, не клиента).
3. `YANDEX_DIRECT_MOCK` пустой.
4. Проект: бриф → семантика → объявления → черновик кампании.
5. Чекбокс «на паузе» → «Запустить кампанию».
6. В кабинете: кампания существует, **не крутится** (Suspended/Off).
7. Нарочно сломайте объявление (запрещённая формулировка) и проверьте, что
   UI показывает текст ошибки Директа, а не «тихий» 500.

### Что будет при частичном сбое публикации

```
createCampaign     — нет объекта; черновик failed, повтор создаст кампанию заново
createCampaign ok,
  setBudget fail   — кампания уже на паузе; повтор продолжит с setBudget
createAdGroups fail— кампания на паузе, без групп; повтор создаст только группы
createAds fail     — группы есть; повтор не дублирует группы, допишет объявления
addKeywords fail   — объявления есть; повтор допишет ключи
```

Компенсация: удаление не делаем (чтобы не потерять уже прошедшую модерацию).
Вместо этого `Campaigns.suspend` и checkpoint в `campaign_drafts.structure_json`.

### E2E (Playwright)

Сценарии Этапов 10–17 (регистрация, пайплайн до черновика, публикация на
паузе, статистика, рекомендации, автопилот, white-label, расходы LLM)
гоняются **headless** против моков Директа / Google / CRM / media.
Ручная проверка в браузере для этих потоков не нужна.

Нужен Postgres (как в шаге 2). Отдельная БД `context_buyer_e2e`, порты
API/web — `3101` / `3100`, чтобы не пересечься с `dev:api` / `dev:web`.

```bash
npx playwright install chromium
npm run test:e2e
```

Переменные — `.env.e2e` (`YANDEX_DIRECT_MOCK=1`, `PIPELINE_QUEUE=inline`).
Если Postgres не на `5433`, задайте `DATABASE_URL` в окружении до запуска.

## Структура

Прод-деплой (env, миграции, health, ограничения релиза): [`docs/14_PRODUCTION_DEPLOY.md`](docs/14_PRODUCTION_DEPLOY.md).

```
/docs                      пакет проектной документации + промпты
.cursorrules
/apps/web                  Next.js
/apps/api                  NestJS + Prisma
/packages/connectors       AdPlatformConnector + AttributionConnector + MediaGenerationConnector
/packages/agents           Semantic … Reporting, Optimization, Attribution, Media
/packages/shared-types
/infra/docker-compose.yml
/infra/migrations          SQL-снимок схемы Этапа 0
/e2e                       Playwright: пользовательский путь Этапов 10–17
```
