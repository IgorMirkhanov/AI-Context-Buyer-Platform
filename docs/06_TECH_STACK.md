# Технологический стек

Факт репозитория (не «выберите TS или Python»).

## Backend
- **Язык:** TypeScript (strict), Node.js ≥ 20.
- **API:** NestJS (`apps/api`), Prisma.
- **Очередь:** BullMQ + Redis; `PIPELINE_QUEUE=inline` без Redis (тесты и E2E).
  Job id `pipeline:{project_id}`.
- **LLM:** heuristic-слой в `@context-buyer/agents` (CI/локально без Anthropic);
  таблица `llm_call_logs`. Живой Claude — опция по ключу, не нужен для моков.

## База данных и хранилища
- **Postgres 16** + Prisma-миграции (`apps/api/prisma`).
- **Эмбеддинги ключей:** JSON в `keyword_embeddings` (Qdrant/pgvector-сервис
  не подключён).
- **Redis 7** — очередь BullMQ, не открытое хранилище OAuth.
- **Media:** локальный `MEDIA_STORE_DIR`; S3 в `.env.example` — заготовка.
- **Токены:** AES-256-GCM, `TOKEN_ENCRYPTION_KEY`.

## Frontend
- **Next.js 15** (App Router), React 19, Tailwind 4 (`apps/web`).
- Playwright: `e2e/platform.spec.ts`, `npm run test:e2e`.

## Интеграции с рекламными платформами
- **Яндекс Директ API v5:** `LiveYandexDirectApi` (JSON-RPC).
- **Google Ads:** `LiveGoogleAdsApi` / мок. Вызовы только из Connector Layer.
- Флаги моков: `YANDEX_DIRECT_MOCK`, `GOOGLE_ADS_MOCK`, `ATTRIBUTION_MOCK`,
  `MEDIA_MOCK`.

## Инфраструктура и деплой
- Docker Compose: `infra/docker-compose.yml` (postgres, redis, опционально api).
- CI: GitHub Actions — линт, Jest API, Playwright E2E с Postgres service.
- Секреты: `.env` / env CI; в репозиторий не коммитить. Прод secret manager
  в коде не подключён (открытый пункт чеклиста клиента).

## Наблюдаемость (как в коде)
- `llm_call_logs` + `GET /projects/:id/llm-usage` (preview, не полный промпт в UI).
- `ops_alerts`: сбой пайплайна, OAuth expiry, 429.
- Внешнего Grafana/Datadog в репозитории нет.

## Оркестрация агентов
Детерминированный state machine + очередь, не LangGraph и не no-code
конструктор. LLM только внутри шага агента.
