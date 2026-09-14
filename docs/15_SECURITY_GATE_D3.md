# D3 — Security gate (pre-deploy)

Date: 2026-09-07. Scope: dependency audit, controller guards, secret logging, login rate-limit.

## 1. npm audit

| Step | Result |
|---|---|
| `npm audit` (before fix) | 4 vulns (3 high deepmerge-ts via prisma, 1 moderate qs) |
| `npm audit fix` | Closed **qs** (moderate). Remaining: deepmerge-ts via `@prisma/config` / `prisma@6.19.3` |
| `overrides.deepmerge-ts` | Attempted; Prisma still nests `deepmerge-ts@7.1.5` — override does not fully replace |
| `npm audit fix --force` | **Not applied** — would downgrade prisma → 6.12 / bump next → 16.x (breaking) |

**Closed:** qs moderate.  
**Open (accepted risk until upstream):** high `deepmerge-ts` under Prisma CLI; high `postcss` under Next (appeared after lockfile refresh). Track Prisma/Next upgrades; do not force-break the stack for deploy day.

## 2. Controller → guard matrix (complete)

| Controller | Base path | JwtAuthGuard | ProjectAccessGuard | Notes |
|---|---|---|---|---|
| `AppController` | `/` | — | — | Public `GET /health` (liveness) |
| `AuthController` | `/auth` | on `me` / `updateMe` only | — | `login`/`register` public + throttle 5/min |
| `OauthController` | `/oauth` | — | — | Public OAuth callbacks; state HMAC via JWT_SECRET |
| `ProjectsController` | `/projects` | class | class | Guard no-ops when no `:id` (list/create); asserts on `:id` |
| `AnalysisController` | `/projects/:id/analysis` | class | class | OK |
| `SemanticController` | `/projects/:id/semantic` | class | class | OK + LLM throttle 10/min |
| `CreativesController` | `/projects/:id/creatives` | class | class | OK + LLM throttle 10/min |
| `CampaignPlanController` | `/projects/:id/campaign-plan` | class | class | OK |
| `CampaignsController` | `/projects/:id/campaigns` | class | class | OK |
| `ReportsController` | `/projects/:id/reports` | class | class | OK |
| `OptimizationController` | `/projects/:id/optimization` | class | class | OK |
| `MediaController` | `/projects/:id/media` | class | class | OK |
| `PipelineController` | `/projects/:id/pipeline` | class | class | OK |
| `AlertsController` | `/projects/:id/alerts` | class | class | OK |
| `AuditController` | `/projects/:id/audit` | class | class | OK |
| `LlmUsageController` | `/projects/:id/llm-usage` | class | class | OK |
| `AiProviderController` | `/organization/ai-provider` | class | — | Org-scoped; writes also `RolesGuard` |
| `TenancyController` | mixed | per-route | per-route on project access | See below |
| `AttributionController` | mixed | per-route on project routes | per-route | See below |

### Intentional unauthenticated endpoints

| Route | Protection |
|---|---|
| `GET /health` | Public liveness |
| `POST /auth/login`, `POST /auth/register` | Public + rate limit |
| `GET /branding/:slug` | Public white-label |
| `POST /auth/invite` | Invite token + password in body |
| `GET /oauth/yandex/callback`, `GET /oauth/google-ads/callback` | OAuth `state` signature |
| `POST /attribution/inbound/:projectId` | Header `x-attribution-secret` vs encrypted inbound secret (not JWT; param is `projectId`, not `:id`) |

**Closed:** all project-data controllers that use `:id` have Jwt + ProjectAccessGuard.  
**Open (by design, document):** webhook/OAuth/public branding; inbound uses shared secret, not JWT.

## 3. Secret logging grep

Searched `apps/api/src` + `scripts` for `console.log` / `Logger` near `accessToken` / `password` / `apiKey` / `decryptSecret`.

| Area | Result |
|---|---|
| Nest runtime (`apps/api/src`) | **No** matches logging decrypted tokens/keys |
| `AuditService.sanitizeAuditJson` | Strips token/secret/password/apikey keys |
| `scripts/audit/*` | Operator tools; refuse `NODE_ENV=production`; previews of plaintext removed / redacted |

**Closed** for runtime API. Scripts remain local-only.

## 4. Rate limit `/auth/login` + global throttle tracker

Automated Nest probe (`apps/api/src/auth/auth-login-throttle.spec.ts`): 10 rapid POSTs with same limits as production (`5 / 60s`).

- Requests 1–5 → 200/201  
- Request 6+ → **429**  
- **Test passed**

Live HTTP against `localhost:3001` was unavailable during the check (`@nestjs/platform-express` loader error after audit-side node_modules churn); unit probe covers the same Throttler config.

### Global default (100 / 60s) — tracker by user, not shared office IP

`ThrottlerModule.forRoot` default `100/min` applies to almost all routes (`GET /health` uses `@SkipThrottle`).
Built-in `ThrottlerGuard` keys by **IP**, which false-positives 429 when several authenticated
staff share one NAT/VPN IP.

Production uses `UserThrottlerGuard` (`apps/api/src/auth/user-throttler.guard.ts`):

| Request | Tracker key |
|---|---|
| Valid JWT (Bearer), even before route `JwtAuthGuard` sets `req.user` | `user:{sub}` |
| No / invalid token (incl. `POST /auth/login`, `POST /auth/register`) | client **IP** (unchanged brute-force shield; route still `@Throttle` 5/min) |

Probe: `apps/api/src/auth/user-throttler.guard.spec.ts` — user A exhausting a low limit does not 429 user B on the same IP; anonymous routes still share an IP bucket.

## 5. Scorecard

| # | Item | Status |
|---|---|---|
| 1 | npm audit / fix critical | **Partial** — qs fixed; Prisma deepmerge-ts + Next postcss remain (no safe non-breaking fix) |
| 2 | Controllers guards full list | **Closed** — matrix above; no missing Jwt+ProjectAccess on project `:id` routes |
| 3 | Secret logging grep | **Closed** for runtime |
| 4 | Login 429 on 6th request | **Closed** (automated test) |
| 5 | This report | Done |

### Remaining before prod

1. Plan Prisma / Next upgrades to clear nested advisory CVEs (or accept + monitor).  
   Next 15→16 assessment: `docs/16_NEXT16_MIGRATION.md` — **not a release blocker** for GHSA-qx2v-qp2m-jg93.  
2. Restore clean `npm run start:dev` / hoist `@nestjs/platform-express` if API process still fails PackageLoader.  
3. Complete D2: real domain OAuth redirects + managed DB/Redis + `prisma migrate deploy` on prod URL.
