# Модели данных

Схема = Prisma `apps/api/prisma/schema.prisma` и миграции
`apps/api/prisma/migrations/`. Ниже — факт, не набросок.

## 1. Таблицы Postgres

```sql
-- Этап 0
organizations (
  id uuid pk,
  name text,
  plan text default 'free',          -- поле есть; смена тарифа/Stripe нет
  slug text unique null,             -- этап 10
  branding_json jsonb null,          -- этап 10
  created_at timestamptz
)
users (
  id uuid pk,
  organization_id uuid fk,
  email text unique,
  password_hash text,
  role enum(owner, member, client),  -- client: этап 10
  terms_accepted_at timestamptz null,-- после этапа 17 (риски)
  created_at timestamptz
)
projects (
  id uuid pk,
  organization_id uuid fk,
  name text,
  status enum(draft, active, archived, disconnected),
  primary_platform enum(yandex_direct, google_ads),
  website_url text null,
  autopilot_enabled boolean default false,     -- этап 11
  autopilot_enabled_at timestamptz null,
  created_at, updated_at
)

-- Этап 10
project_access (
  id uuid pk,
  project_id uuid fk,
  user_id uuid fk,
  created_at,
  unique (project_id, user_id)
)
project_favorites (
  id uuid pk, user_id uuid fk, project_id uuid fk, created_at,
  unique (user_id, project_id)
)

ai_provider_credentials (
  id uuid pk, organization_id uuid fk,
  provider enum(anthropic, openai),
  api_key_encrypted text,            -- AES-256-GCM, как OAuth-токены
  status enum(unverified, valid, invalid),
  last_verified_at timestamptz null,
  created_at, updated_at,
  unique (organization_id, provider)
)

-- Этап 1
ad_platform_credentials (
  id uuid pk,
  project_id uuid fk,
  platform enum(yandex_direct, google_ads),
  access_token_encrypted text,
  refresh_token_encrypted text null,
  expires_at timestamptz null,
  scopes text null,
  external_account_id text null,
  created_at,
  unique (project_id, platform)
)
project_briefs (
  id uuid pk, project_id uuid fk, version int,
  payload_json jsonb, created_at
)

-- Этап 2
semantic_clusters (
  id uuid pk, project_id uuid fk,
  name text, category enum(brand, feature, geo, generic), created_at
)
semantic_keywords (
  id uuid pk, project_id uuid fk, phrase text, frequency int,
  intent enum(hot, warm, navigational),
  cluster_id uuid null, is_negative boolean, source text, created_at
)
agent_tasks (
  id uuid pk, project_id uuid fk,
  agent_type enum(semantic, copywriting, validation, campaign_builder,
                  reporting, optimization, media),
  status enum(pending, running, done, failed),
  input_ref, output_ref, error text null, started_at, finished_at
)
llm_call_logs (                          -- запись с этапа 2; UI — этап 17
  id uuid pk, project_id uuid fk,
  agent_type AgentType, step text, model text,
  prompt text, response text,            -- полный текст в БД
  input_tokens int, output_tokens int,
  cost_usd decimal(12,6), latency_ms int, created_at
)
keyword_embeddings (
  id uuid pk, project_id uuid fk, phrase text, embedding jsonb, created_at
)

-- Этап 3
platform_limits (
  id uuid pk, platform AdPlatform, element_type text,
  max_length int, max_count int, unique (platform, element_type)
)
ad_creatives (
  id uuid pk, project_id uuid fk, cluster_id uuid fk,
  type enum(headline1, headline2, description, sitelink, callout),
  text text, status enum(draft, edited, approved), ab_group text, created_at
)
validation_issues (
  id uuid pk, project_id uuid fk, creative_id uuid null,
  level enum(critical, warning), code text, message text,
  auto_fixed boolean, created_at
)

-- Этап 4
campaign_drafts (
  id uuid pk, project_id uuid fk, structure_json jsonb,
  status enum(pending_approval, publishing, published, failed),
  created_at, updated_at
)
campaigns (
  id uuid pk, project_id uuid fk, draft_id uuid null,
  external_campaign_id text, platform AdPlatform,
  status enum(paused, active, archived) default paused,
  budget decimal(12,2) null, targeting_json jsonb null, created_at
)

-- Этап 5
performance_snapshots (
  id uuid pk, project_id uuid fk, campaign_id uuid fk, date date,
  impressions int, clicks int, ctr decimal, cpc decimal,
  conversions int, cpl decimal null, spend decimal,
  unique (campaign_id, date)
)

-- Этап 7 (+ applied_by на этапе 11)
optimization_recommendations (
  id uuid pk, project_id uuid fk, campaign_id uuid fk,
  type enum(pause_campaign, reduce_budget, add_negative),
  status enum(proposed, approved, rejected, applied, failed),
  evidence_json jsonb, action_json jsonb, rationale text,
  error text null, applied_by text null,
  created_at, decided_at, applied_at
)

-- Этап 8
attribution_credentials (
  id uuid pk, project_id uuid fk,
  provider enum(bitrix24, amocrm, calltouch, roistat),
  token_encrypted text, extra_encrypted text null,
  inbound_secret_encrypted text, created_at,
  unique (project_id, provider)
)
conversion_events (
  id uuid pk, project_id uuid fk, campaign_id uuid null,
  provider AttributionProvider, external_id text,
  type enum(lead, deal, call), occurred_at timestamptz,
  amount decimal null, utm_campaign text null,
  phone_hash text null,          -- сырой телефон не хранить
  title text, created_at,
  unique (project_id, provider, external_id)
)

-- Этап 9
media_assets (
  id uuid pk, project_id uuid fk, cluster_id uuid null,
  kind enum(image, video), provider text, prompt text,
  storage_key text, mime_type text, width int, height int,
  duration_ms int null,
  status enum(generated, approved, rejected), created_at
)

-- Этап 14
ops_alerts (
  id uuid pk, project_id uuid fk,
  kind enum(pipeline_failed, oauth_expiring, oauth_expired, platform_rate_limit),
  title text, detail text null, acknowledged_at timestamptz null, created_at
)

-- Этап 16
ad_write_audit (
  id uuid pk, project_id uuid fk, user_id uuid null,
  actor enum(user, autopilot, system),
  action enum(create_campaign, create_ad_groups, create_ads, add_keywords,
              add_negative_keywords, set_budget, pause_campaign),
  platform AdPlatform, status enum(success, failed),
  summary_json jsonb,            -- без token/secret
  error text null, created_at
)
```

REST **не** отдаёт: сырые OAuth/CRM-токены, полный LLM-промпт (только
`promptPreview`), сырые телефоны.

## 2. JSON-схема брифа (`project_briefs.payload_json`)

Форма создания проекта заполняет обязательный минимум. Остальные поля
схемы допустимы в JSON (валидатор `additionalProperties: true` на части
узлов).

```json
{
  "project": {
    "website_url": "https://example.com",
    "geo": ["RU-MOW", "KZ-ALA"],
    "budget": { "daily": 5000, "currency": "RUB" },
    "target_cpl": 300,
    "platforms": ["yandex_direct"]
  },
  "marketing": {
    "product_description": "Продажа игровых ноутбуков премиум-сегмента",
    "usp": [
      "Гарантия 3 года",
      "Бесплатная доставка по РФ",
      "Trade-in старого устройства"
    ],
    "target_audience": [
      {
        "segment": "Геймеры 18-30",
        "pains": ["нужна высокая производительность", "боятся перегрева"],
        "objections": ["дорого", "не уверены в надёжности бренда"]
      }
    ],
    "forbidden_phrases": ["самый дешёвый", "гарантия 100%"],
    "price_segment": "premium"
  },
  "exclusions": {
    "global_negative_keywords": ["бесплатно", "скачать", "торрент", "б/у", "ремонт"],
    "excluded_placements": ["example-junk-site.ru"]
  },
  "utm": {
    "template": "utm_source={platform}&utm_medium=cpc&utm_campaign={campaign_id}&utm_content={ad_id}"
  },
  "goals": [
    { "name": "Заявка на сайте", "type": "form_submit", "external_goal_id": "12345" },
    { "name": "Звонок", "type": "call", "external_goal_id": "67890" }
  ]
}
```

Обязательный минимум API создания: `website_url`, `geo`, `budget`,
`marketing.usp`, `marketing.target_audience[].segment`,
`exclusions.global_negative_keywords` (может быть пустым массивом).
`target_cpl` опционален; Reporting/Optimization без него не режут бюджет
по CPL.

## 3. Семантическое ядро (между агентами)

```json
{
  "clusters": [
    {
      "cluster_name": "Игровые ноутбуки Asus",
      "category": "brand",
      "keywords": [
        { "phrase": "купить игровой ноутбук asus", "intent": "hot", "frequency": 1200 },
        { "phrase": "ноутбук asus rog обзор", "intent": "warm", "frequency": 300 }
      ],
      "negative_keywords": ["ремонт asus", "asus драйвера"]
    }
  ],
  "global_negatives": ["бесплатно", "скачать", "б/у"]
}
```

## 4. Креативы

```json
{
  "cluster_name": "Игровые ноутбуки Asus",
  "ads": [
    {
      "headline1": "Игровые ноутбуки Asus ROG",
      "headline2": "Гарантия 3 года | Доставка бесплатно",
      "description": "Официальный магазин. Trade-in старого устройства. Выбор из 40+ моделей.",
      "sitelinks": ["Каталог ROG", "Рассрочка 0%", "Сравнить модели", "Контакты"],
      "callouts": ["Гарантия 3 года", "Бесплатная доставка", "Trade-in"]
    }
  ],
  "ab_variants": 2
}
```

В БД строки нормализованы по `ad_creatives.type` (headline1/headline2/…).
`status = edited` — после ручной правки (метрика качества этапа рисков).

## 5. Структура кампании (контракт Builder ↔ Connector)

```json
{
  "campaign": {
    "name": "Asus Gaming — Search — RU",
    "type": "search",
    "budget_daily": 5000,
    "bidding_strategy": "manual_cpc",
    "geo": ["RU-MOW"],
    "href": "https://example.com",
    "initial_status": "paused"
  },
  "ad_groups": [
    {
      "name": "Игровые ноутбуки Asus",
      "keywords": ["купить игровой ноутбук asus"],
      "negative_keywords": ["ремонт asus"],
      "ads": [
        {
          "ab_group": "A",
          "headline1": "…",
          "headline2": "…",
          "description": "…"
        }
      ]
    }
  ],
  "publish": { "step": null, "error": null }
}
```

Конвертацию в JSON-RPC Директа / mutate Google Ads делает адаптер, не агент.
`publish` — checkpoint частичного сбоя записи в кабинет (этап 4).

## 6. White-label JSON (`organizations.branding_json`)

```json
{
  "productName": "Кабинет агентства",
  "logoUrl": null,
  "accentColor": "#18181b",
  "supportEmail": null,
  "hidePlatformBadge": false
}
```

Slug — отдельная колонка `organizations.slug`
(`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`).
