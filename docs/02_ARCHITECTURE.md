# Архитектура системы

Факт по репозиторию (этапы 0–17). Оркестрация — код, не LLM. Запись в
рекламный кабинет — только Connector Layer. Публикация кампаний — только
из UI.

## 1. Слои

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WEB (Next.js)                                                            │
│  Регистрация /terms · проекты + бриф · white-label · инвайты            │
│  Пайплайн · черновик · «Запустить» (paused) · отчёт · рекомендации      │
│  Автопилот (opt-in) · журнал аудита · расходы LLM · оповещения          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ REST JSON + JWT
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ API Core (NestJS)                                                        │
│  Auth · Projects · Tenancy · CRUD артефактов · шифрование токенов       │
│  organizations.plan в схеме есть; биллинга (Stripe/тарифы) нет          │
└─────────────────────────────────────────────────────────────────────────┘
        │                │                    │
        ▼                ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐
│ ORCHESTRATOR │  │ QUEUE/INFRA  │  │ DATA & STORAGE      │
│ state machine│  │ PipelineQueue│  │ Postgres (Prisma)   │
│ planPipeline │  │ inline|bullmq│  │ Redis (BullMQ)      │
│ не публикует │  │ job/project  │  │ файлы media-store   │
└──────┬───────┘  └──────────────┘  │ S3 — заготовка env  │
       │                            └─────────────────────┘
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENTS LAYER  (@context-buyer/agents)                                    │
│  Semantic · Copywriting · Validation · Campaign Builder                  │
│  Reporting · Optimization · (промпты media)                              │
│  Heuristic LLM по умолчанию; вызовы пишутся в llm_call_logs              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐
│ CONNECTOR    │  │ ATTRIBUTION  │  │ MEDIA GENERATION    │
│ LAYER        │  │ CONNECTOR    │  │ CONNECTOR           │
│ Connector-   │  │ Bitrix24     │  │ image/video preview │
│ Router →     │  │ amoCRM       │  │ не в кабинет        │
│ AdPlatform-  │  │ Calltouch    │  └─────────────────────┘
│ Connector    │  │ Roistat      │
│ Yandex|Google│  │ phone = hash │
└──────────────┘  └──────────────┘

┌─────────────────────┐  ┌───────────────────────────────────────────────┐
│ AUTOPILOT POLICY    │  │ OPS & GOVERNANCE                              │
│ AUTOPILOT_GATES     │  │ ops_alerts · ad_write_audit · llm-usage UI    │
│ pause/budget/neg.   │  │ /terms · acceptTerms · ProjectApiLimiter      │
│ createCampaign — нет│  │ OAuth refresh per project_id                  │
└─────────────────────┘  └───────────────────────────────────────────────┘
```

## 2. Компоненты

### 2.1 Backend API (Core)

Пользователи, организации, проекты, брифы, CRUD артефактов. Не вызывает
SDK Директа/Google Ads. Биллинг не реализован (см. `10_RISKS_AND_OPEN_QUESTIONS.md`).

### 2.2 Orchestrator

`packages/agents/src/orchestrator/machine.ts` — `planPipeline(facts)`.
Стадии: `idle`, `brief_submitted`, `semantic_*`, `copy_*`,
`awaiting_approval`, `launched`, `live_optimizing`, `failed`.
Автошаги: semantic → copywriting → campaign_builder. На
`awaiting_approval` очередь останавливается. Публикация не является шагом
машины.

### 2.3 Queue / Infra Layer

`PipelineQueue`: job id `pipeline:{project_id}`. Kind: `pipeline_run`,
`token_refresh`, `performance_collect`, `autopilot`, `ops_alerts`.
`PIPELINE_QUEUE=inline|bullmq|auto`. Нет silent fallback с BullMQ на inline.

### 2.4 Connector Layer

Единственная точка к рекламным API. `ConnectorRouter.forPlatform(platform)`
→ `YandexDirectConnector` | `GoogleAdsConnector`. Агенты и оркестратор
работают только с `AdPlatformConnector`. Моки: `YANDEX_DIRECT_MOCK`,
`GOOGLE_ADS_MOCK`. Живые вызовы — `ProjectApiLimiter` с ключом
`{platform}:{projectId}`.

### 2.5 Attribution Connector

CRM/коллтрекинг отдельно от рекламных SDK. `ATTRIBUTION_MOCK=1` для CI.

### 2.6 Media Generation Connector

Картинки/видео как превью платформы. `MEDIA_MOCK=1`. В Директ/Google Ads
не заливаются.

### 2.7 Agents Layer

Узкий JSON in/out на агента. Локально — heuristic-реализации без Anthropic.
Полный промпт в UI не отдаётся (этап 17).

### 2.8 Autopilot Policy Layer

Порог на разобранных/применённых рекомендациях. Тумблер на `project_id`.
Разрешено: pause, budget, negatives. Запрещено: создание кампаний.

### 2.9 Ops & Governance Layer

`ops_alerts`, `ad_write_audit`, сводка `llm_call_logs`, согласие `/terms`,
ротация OAuth, journal «кто писал в кабинет».

### 2.10 Data & Storage

- **Postgres** — все сущности, изоляция по `project_id` / `organization_id`.
- **Эмбеддинги ключей** — JSON в `keyword_embeddings` (не отдельный Qdrant).
- **Redis** — BullMQ, не кэш токенов в открытом виде.
- **Локальный media-store** / заготовка S3 в `.env.example`.

## 3. Мультиклиентская изоляция

- Токены, кампании, снимки, алерты, LLM-логи — только с `project_id`.
- MCC Google — административный login-customer, не общая куча клиентских данных.
- Fair queue: один job на проект, лимитер API на `{platform}:{projectId}`.
- Субклиент (`UserRole.client` + `project_access`) не получает write в кабинет.

## 4. Поток одного проекта

1. `POST /auth/register` (нужен `acceptTerms`) → организация + owner.
2. `POST /projects` — бриф в `project_briefs`.
3. OAuth → зашифрованные токены в `ad_platform_credentials`.
4. `POST /projects/:id/pipeline/run` → semantic → copy → draft.
   Человек правит объявления/черновик.
5. Чекбокс + `POST .../campaigns/publish` → кабинет **paused**, строки в
   `ad_write_audit`.
6. `POST .../reports/collect` → снимки + insights.
7. `POST .../optimization/run` → рекомендации; apply вручную или автопилот
   после порога.
8. Опционально: attribution, media, инвайт клиента, просмотр LLM $ / журнала.

## 5. Асинхронность и надёжность

- Шаги пайплайна пишут в БД до следующего агента (`agent_tasks`).
- Ретраи очереди; сбой пайплайна → `ops_alerts.pipeline_failed`.
- LLM-вызовы: `llm_call_logs` (промпт в БД есть, в REST UI — только preview).
- Идемпотентность публикации: checkpoint в `campaign_drafts.structure_json`;
  компенсационное удаление объектов кабинета не делаем.
