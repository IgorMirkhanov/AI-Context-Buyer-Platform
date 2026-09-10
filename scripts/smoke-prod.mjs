#!/usr/bin/env node
/**
 * Post-deploy smoke (no OAuth / ad platforms).
 *
 * Usage:
 *   node scripts/smoke-prod.mjs --api-url=https://api.example.com --web-url=https://example.com
 *   API_URL=… WEB_URL=… node scripts/smoke-prod.mjs
 *   node scripts/smoke-prod.mjs https://api.example.com https://example.com
 *
 * Optional existing account (skips register):
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke-prod.mjs …
 *
 * Exit 0 = all PASS; non-zero = any FAIL (CI post-deploy gate).
 * Live Yandex/Google Connector checks stay in README «Ручной прогон Connector».
 */

const USAGE = `Usage:
  node scripts/smoke-prod.mjs --api-url=<url> --web-url=<url>
  API_URL=<url> WEB_URL=<url> node scripts/smoke-prod.mjs
  Optional: SMOKE_EMAIL + SMOKE_PASSWORD (reuse account; skip register)
`;

function parseArgs(argv) {
  const out = {
    apiUrl: process.env.API_URL?.trim() || '',
    webUrl: process.env.WEB_URL?.trim() || '',
    email: process.env.SMOKE_EMAIL?.trim() || '',
    password: process.env.SMOKE_PASSWORD?.trim() || '',
  };
  const positionals = [];
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (raw.startsWith('--api-url=')) {
      out.apiUrl = raw.slice('--api-url='.length).trim();
      continue;
    }
    if (raw.startsWith('--web-url=')) {
      out.webUrl = raw.slice('--web-url='.length).trim();
      continue;
    }
    if (raw.startsWith('--email=')) {
      out.email = raw.slice('--email='.length).trim();
      continue;
    }
    if (raw.startsWith('--password=')) {
      out.password = raw.slice('--password='.length).trim();
      continue;
    }
    if (raw.startsWith('-')) {
      throw new Error(`Unknown flag: ${raw}\n${USAGE}`);
    }
    positionals.push(raw);
  }
  if (positionals[0]) out.apiUrl = positionals[0];
  if (positionals[1]) out.webUrl = positionals[1];
  return out;
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function lookLikeHtml(body) {
  const sample = body.slice(0, 4096).toLowerCase();
  return (
    sample.includes('<!doctype html') ||
    sample.includes('<html') ||
    sample.includes('<head') ||
    sample.includes('<body')
  );
}

async function readBody(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { text, json };
}

async function main() {
  let cfg;
  try {
    cfg = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }

  if (!cfg.apiUrl || !cfg.webUrl) {
    console.error('API_URL and WEB_URL are required.\n' + USAGE);
    process.exit(2);
  }
  if (!isHttpUrl(cfg.apiUrl) || !isHttpUrl(cfg.webUrl)) {
    console.error('API_URL and WEB_URL must be absolute http(s) URLs.');
    process.exit(2);
  }

  const api = stripTrailingSlash(cfg.apiUrl);
  const web = stripTrailingSlash(cfg.webUrl);
  const results = [];

  const check = async (name, fn) => {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      results.push({ name, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL  ${name}`);
      console.log(`      ${msg}`);
      results.push({ name, ok: false, msg });
    }
  };

  await check('GET {API_URL}/health → 200 + status ok', async () => {
    const res = await fetch(`${api}/health`, {
      method: 'GET',
      redirect: 'follow',
    });
    const { text, json } = await readBody(res);
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!json || json.status !== 'ok') {
      throw new Error(
        `expected JSON status "ok", got: ${text.slice(0, 300)}`,
      );
    }
  });

  const useExisting = Boolean(cfg.email && cfg.password);
  const email =
    cfg.email ||
    `smoke+${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = cfg.password || `Smoke-${Date.now()}aA1!`;
  let accessToken = '';

  if (useExisting) {
    await check('POST /auth/login (existing SMOKE_EMAIL)', async () => {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { text, json } = await readBody(res);
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!json?.accessToken || typeof json.accessToken !== 'string') {
        throw new Error('login response missing accessToken');
      }
      accessToken = json.accessToken;
    });
  } else {
    await check('POST /auth/register (unique smoke user)', async () => {
      const res = await fetch(`${api}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          organizationName: `Smoke ${new Date().toISOString()}`,
          acceptTerms: true,
        }),
      });
      const { text, json } = await readBody(res);
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!json?.accessToken || typeof json.accessToken !== 'string') {
        throw new Error('register response missing accessToken');
      }
      accessToken = json.accessToken;
    });

    await check('POST /auth/login (same smoke user)', async () => {
      const res = await fetch(`${api}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const { text, json } = await readBody(res);
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!json?.accessToken || typeof json.accessToken !== 'string') {
        throw new Error('login response missing accessToken');
      }
      accessToken = json.accessToken;
    });
  }

  await check('GET /auth/me → 200', async () => {
    if (!accessToken) {
      throw new Error('no accessToken from prior auth step');
    }
    const res = await fetch(`${api}/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { text, json } = await readBody(res);
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!json?.email) {
      throw new Error('me response missing email');
    }
  });

  await check('GET {WEB_URL} → 200 + HTML', async () => {
    const res = await fetch(web, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const text = await res.text();
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (!lookLikeHtml(text)) {
      throw new Error('response body does not look like an HTML document');
    }
  });

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length === 0) {
    console.log(`smoke-prod: ALL PASS (${results.length} checks)`);
    process.exit(0);
  }
  console.log(
    `smoke-prod: ${failed.length} FAIL / ${results.length} checks`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('smoke-prod: unexpected error');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
