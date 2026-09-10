# Production deploy checklist (Этап 18.5)

Живой чеклист готовности продукта к чужому кабинету (не только деплой):
[`docs/10_RISKS_AND_OPEN_QUESTIONS.md`](./10_RISKS_AND_OPEN_QUESTIONS.md) — **§7**.

Шаблон имён переменных: корневой [`.env.example`](../.env.example).
Прод-ориентированный список без локальных дефолтов: [`.env.production.example`](../.env.production.example).

---

## 1. Политика секретов (обязательно)

**Секреты живут только в secret manager хостинга** (или эквивалент: Railway/Fly/Render secrets, GitHub Environments, Vault, K8s Secrets, облачный SM).

- **Не** хранить прод-секреты в `.env` / `.env.production` **на диске** прод-сервера или в слое образа контейнера.
- **Не** коммитить реальные значения в git (`.env`, `.env.production`, `.env.production.secrets` — gitignored).
- Локальный файл `.env.production.secrets` — только генератор/черновик на машине оператора; в прод копируются значения **в secret manager**, файл на сервер не кладётся.
- Runtime API не должен писать в логи расшифрованные OAuth-токены, API-ключи, пароли БД (см. `.cursorrules` п.6). Аудит-скрипты `scripts/audit/*` — только локально; в `NODE_ENV=production` отказываются расшифровывать токены.

Колонка **Secret** ниже = значение нельзя светить в логах, тикетах, git, скриншотах CI.

---

## 2. Полный список переменных окружения (из `.env.example`)

Легенда **Required (prod)**:

| Метка | Смысл |
|-------|--------|
| **да** | Без этого API/web в проде не стартует или неработоспособен |
| **условно** | Нужно, если включён соответствующий live-режим (mock выключен) |
| **нет** | Опционально / есть безопасный дефолт |

### Приложение / хост

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `NODE_ENV` | да (`production`) | нет | Хостинг |
| `API_PORT` | нет (часто `3001`) | нет | Хостинг |
| `WEB_PORT` | нет (часто `3000`) | нет | Хостинг / compose |
| `WEB_ORIGIN` | **да** (`https://…`, не localhost) | нет | Публичный URL фронта |
| `NEXT_PUBLIC_API_URL` | **да** для сборки web | нет | Публичный URL API; **bake-in** на этапе Docker/CI build (`build-arg` / Actions variable) |
| `JWT_SECRET` | **да** (≥32 символов, не placeholder) | **да** | Сгенерировать: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` → secret manager |
| `JWT_EXPIRES_IN` | нет (`7d`) | нет | Политика сессий |
| `TOKEN_ENCRYPTION_KEY` | **да** (64 hex = 32 байта) | **да** | Сгенерировать: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → secret manager |

### Postgres / Redis / очередь

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `DATABASE_URL` | **да** | **да** (пароль в URL) | Managed Postgres провайдера; SSL по требованиям хоста |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | условно (если поднимаете Postgres сами, напр. `infra/docker-compose.prod.yml`) | **да** (password) | Secret manager; **без** дефолтных паролей |
| `POSTGRES_PORT` / `REDIS_PORT` | нет | нет | Только local compose; в проде порты БД **не** публиковать наружу |
| `REDIS_URL` | **да** | условно (если есть пароль в URL) | Managed Redis |
| `PIPELINE_QUEUE` | **да** = `bullmq` | нет | Никогда `auto` / `inline` в проде |

### Ops / фоновые интервалы

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `ALERTS_POLL_MS` | нет | нет | Интервал скана ops_alerts |
| `ALERT_WEBHOOK_URL` | нет | **да** (URL часто с токеном) | Slack Incoming Webhook / Telegram bot URL; пусто = не слать |
| `TOKEN_REFRESH_POLL_MS` | нет (прод: напр. `900000`) | нет | Ротация OAuth |
| `PERFORMANCE_POLL_MS` | нет | нет | Снимки статистики |
| `CAMPAIGN_SYNC_MS` | нет | нет | Синк кампаний |
| `CONNECTION_VERIFY_THROTTLE_MS` | нет | нет | Троттлинг live-probe |
| `AUTOPILOT_POLL_MS` | нет (`0` = выкл.) | нет | Автопилот-поллер |

### Яндекс Директ / OAuth

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `YANDEX_CLIENT_ID` | условно (live: `YANDEX_DIRECT_MOCK` пусто) | нет (публичный client id) | [oauth.yandex.ru](https://oauth.yandex.ru/) → приложение |
| `YANDEX_CLIENT_SECRET` | условно (live) | **да** | Тот же кабинет OAuth Яндекса |
| `YANDEX_REDIRECT_URI` | условно (live) | нет | `https://api.<DOMAIN>/oauth/yandex/callback` — **точно** как в кабинете |
| `YANDEX_OAUTH_SCOPE` | нет (`direct:api`) | нет | Документация Директа / OAuth |
| `YANDEX_DIRECT_API_URL` | нет (прод API) | нет | `https://api.direct.yandex.com/json/v5` |
| `YANDEX_DIRECT_MOCK` | **да пусто** для live | нет | Пусто / не `1` = live коннектор |

Дополнительно: заявка на доступ к API Директа в кабинете рекламодателя (процесс Яндекса) — вне кода.

### Google Ads / OAuth

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `GOOGLE_ADS_CLIENT_ID` | условно (`GOOGLE_ADS_MOCK=0`) | нет | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID (`….apps.googleusercontent.com`) |
| `GOOGLE_ADS_CLIENT_SECRET` | условно (live) | **да** | Тот же OAuth client |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | условно (live) | **да** | Google Ads → API Center (MCC); **не** путать с API key `AIza…` |
| `GOOGLE_ADS_REDIRECT_URI` | условно (live) | нет | `https://api.<DOMAIN>/oauth/google-ads/callback` — в Authorized redirect URIs |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | нет | нет | MCC id (цифры), если работа через менеджерский аккаунт |
| `GOOGLE_ADS_MOCK` | **да** = `0` для попытки live | нет | `1` = stub |

См. §5: до Basic Access live Google ограничен тестовым аккаунтом.

### LLM / media / attribution / S3

| Переменная | Required (prod) | Secret | Откуда / как задать |
|------------|-----------------|--------|---------------------|
| `ANTHROPIC_API_KEY` | нет (fallback; приоритет — ключ в UI org) | **да** | console.anthropic.com |
| `GROQ_API_KEY` | нет | **да** | console.groq.com |
| `GEMINI_API_KEY` | нет | **да** | Google AI Studio |
| `OPENAI_API_KEY` | условно (live media) | **да** | platform.openai.com |
| `MEDIA_IMAGE_MODEL` | нет | нет | напр. `dall-e-3` |
| `MEDIA_MOCK` | пусто для live media | нет | |
| `MEDIA_STORE_DIR` | нет | нет | Локальный каталог файлов (если без S3) |
| `ATTRIBUTION_MOCK` | пусто при реальной CRM | нет | |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_REGION` | условно (экспорт/объекты) | **да** (keys) | S3-compatible провайдер |

### Образы (если деплой через GHCR + `infra/docker-compose.prod.yml`)

| Переменная | Required (prod) | Secret | Откуда |
|------------|-----------------|--------|--------|
| `API_IMAGE` / `WEB_IMAGE` | условно (prod-compose) | нет | `ghcr.io/<owner>/<repo>/api|web:<sha\|latest>` из workflow `build-images.yml` |

Локальные-only из `.env.example` (`WEB_PORT` для dev, Playwright `.env.e2e`) в прод secret manager **не** переносить как «обязательные».

---

## 3. Порядок первого деплоя

1. **Домены и OAuth consoles**  
   Зарегистрировать redirect URI и `WEB_ORIGIN` / `NEXT_PUBLIC_API_URL` (см. таблицу выше) **до** первого OAuth в проде.

2. **Secret manager**  
   Залить все **Secret** и обязательные prod-переменные. На диске сервера файла `.env` с секретами быть не должно.

3. **Managed Postgres + Redis**  
   Получить `DATABASE_URL`, `REDIS_URL`. Убедиться, что из сети API они доступны.

4. **Миграции**  
   - Образ API (`apps/api/Dockerfile`) при старте выполняет `prisma migrate deploy`, **или**  
   - Один раз вручную с **прод** `DATABASE_URL`:

   ```bash
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```

   Не направлять эту команду на локальную БД.

5. **Сборка / публикация образов** (если не Vercel для web)  
   Push в `main` → `.github/workflows/build-images.yml` → GHCR `:latest` и `:<git-sha>`.  
   Для web заранее задать Actions variable `NEXT_PUBLIC_API_URL`.

6. **Порядок поднятия сервисов**  
   1. Postgres + Redis (healthy)  
   2. **api** (migrate + listen)  
   3. **web** (после того как API отвечает)

   Пример: `docker compose --env-file <только для подстановки имён образов> -f infra/docker-compose.prod.yml up -d` — при этом сами секреты лучше инжектить из SM хостинга, а не из файла на диске.

7. **Проверки после старта**  
   - `GET https://api.<DOMAIN>/health` → **200**, `status: "ok"`, `checks.postgres` / `checks.redis` = `"up"`.  
   - **503** = не поднимать web / не лить трафик, пока БД или Redis down.  
   - Открыть `WEB_ORIGIN`, логин/регистрация, без stack traces в ответах API.  
   - Автоматический post-deploy gate (без OAuth кабинетов):

   ```bash
   npm run smoke:prod -- --api-url=https://api.<DOMAIN> --web-url=https://<DOMAIN>
   # or: API_URL=… WEB_URL=… npm run smoke:prod
   # reuse account: SMOKE_EMAIL=… SMOKE_PASSWORD=… npm run smoke:prod -- …
   ```

   Скрипт: `scripts/smoke-prod.mjs` (обёртка `scripts/smoke-prod.sh`). Exit ≠ 0 при любом FAIL.  
   Живой Яндекс/Google — отдельно, README «Ручной прогон Connector».  
   - Опционально: критичный ops_alert → `ALERT_WEBHOOK_URL`.

8. **Smoke живых кабинетов** — по чеклисту §7 в `docs/10` (не замена health).

---

## 4. Dependency install / образы

Production build **MUST** начинаться с чистого дерева и `npm ci` (см. Dockerfile API/web). Не кэшировать чужой `node_modules` между lockfile-версиями. После `npm ci` — `prisma generate` (уже в образе API).

Локальный `infra/docker-compose.yml` — только разработка; прод — хостинг или `infra/docker-compose.prod.yml` (без публикации портов Postgres/Redis).

---

## 5. Известные ограничения на релизе

| Тема | Статус |
|------|--------|
| **Google Ads Basic Access** | Live Google Ads API до одобрения Basic Access работает **только с тестовым аккаунтом** (уровень Test account в API Center). Это **внешний** процесс Google; **не блокирует** релиз остального продукта (Яндекс, пайплайн, UI, CRM-моки/live по готовности). После одобрения — обновить developer token / доступ и прогнать живой smoke. |
| **Биллинг / `organizations.plan`** | **Отсутствует осознанно.** Внутреннее приложение без внешних платящих клиентов; тарифов, Stripe и смены `plan` нет и не требуются для текущего релиза. См. `docs/10` §4–§7. |
| Публикация кампаний | Только из UI, кампания в paused / аналог Off — без автопубликации. |
| Полный LLM-промпт в UI | Не отдаётся (только preview / расходы). |

---

## 6. Mocks (кратко)

| Variable | Production |
|----------|------------|
| `PIPELINE_QUEUE` | `bullmq` |
| `GOOGLE_ADS_MOCK` | `0` (live; с ограничением тестового аккаунта до Basic Access) |
| `YANDEX_DIRECT_MOCK` | empty |
| `ATTRIBUTION_MOCK` | empty при реальных CRM credentials |
| `MEDIA_MOCK` | empty при `OPENAI_API_KEY` / org media key |

`1` оставляет stub-коннектор даже при наличии ключей.

---

## 7. Ссылки

- Живой чеклист клиента: [`10_RISKS_AND_OPEN_QUESTIONS.md` §7](./10_RISKS_AND_OPEN_QUESTIONS.md#7-чеклист-готовности-к-реальному-клиенту)
- Security gate: [`15_SECURITY_GATE_D3.md`](./15_SECURITY_GATE_D3.md)
- Образы: `.github/workflows/build-images.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`
