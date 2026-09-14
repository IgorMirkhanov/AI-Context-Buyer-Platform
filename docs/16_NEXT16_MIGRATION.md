# Next.js 15 → 16 migration assessment (postcss / GHSA)

Date: 2026-09-14. Branch context: `stage-18-production-hardening`.
Related advisories: GHSA-qx2v-qp2m-jg93 (and related PostCSS XSS / path issues).

## Verdict

**Do not block the current production release** for this advisory alone.
Effort to upgrade when scheduled: **S–M**. Risk in this repo is low relative to a typical Next app.

## Why the CVE is low urgency here

| Fact | Implication |
|------|-------------|
| Flagged path is `next@15.5.24` → nested `postcss@8.4.31` (`< 8.5.10`) | Scanner noise on the **build toolchain**, not a runtime API |
| App PostCSS (Tailwind v4 `@tailwindcss/postcss`) already resolves to **8.5.28** | Our CSS pipeline is on a patched PostCSS |
| Exploit model needs stringifying **untrusted** CSS into HTML `<style>` | Next build runs over first-party `globals.css`, not user-uploaded CSS |
| `npm audit fix --force` can yank Next / break the stack | Avoid; prefer deliberate Next 16 bump |

Next 16 alone may **still** vendor an older PostCSS until upstream updates — treat clearing the GHSA as “quiet scanners,” not a product hotfix.

## Current stack (`apps/web`)

- `next` / `eslint-config-next`: **15.5.24**
- `react` / `react-dom`: **19.1.0**
- App Router only; **no** `pages/`, **no** middleware, **no** `next/image`, **no** custom webpack
- `next.config.ts`: `output: "standalone"` (Docker), `outputFileTracingRoot` + `turbopack.root` for monorepo
- Dev: `next dev --turbopack`; Docker prod build: plain `next build` (webpack today)
- Lint already on ESLint flat config (not `next lint`)

## Main upgrade risks (this repo)

1. **Next 16 defaults Turbopack for `next build`** — verify Docker `standalone` + monorepo `turbopack.root` / tracing; keep `next build --webpack` as temporary fallback if needed.
2. **React peer bump** to whatever Next 16 requires (already on React 19 — smaller jump than 18→19).
3. **Dual deploy**: Vercel vs Docker standalone must both smoke-test.

Low risk: fonts (`next/font`), client-heavy UI, no sync server `params`/`cookies` migration left.

## Suggested work when scheduled

1. Bump `next`, `eslint-config-next`, `react`, `react-dom` to Next 16-compatible versions.
2. `npm run build -w web`; Docker image + `node server.js` standalone.
3. Vercel preview deploy; auth/login/invite/`useSearchParams`; portfolio + project tabs; `npm run test:e2e`.
4. Drop redundant `--turbopack` from `dev` if it becomes default; document webpack fallback for Docker if used.
5. Re-check `npm audit` — if nested postcss still flagged, consider a verified override only after builds pass.

## Tracking

Open as a follow-up engineering task (not Stage 18 release gate). Link from `docs/15_SECURITY_GATE_D3.md` remaining items if needed.
