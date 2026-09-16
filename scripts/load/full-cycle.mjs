/**
 * Full-cycle stress: register → project → AI (openai→heuristic) → OAuth mock
 * → pipeline/run → publish → reports/collect.
 *
 * Spawns an isolated mock API on API_PORT (default 3099) unless
 * STRESS_USE_EXISTING=1 (then hits API_BASE / existing API_PORT).
 *
 * Usage:
 *   node scripts/load/full-cycle.mjs
 *   CONCURRENCY=4 CYCLES=6 node scripts/load/full-cycle.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiPost,
  createProject,
  loadEnv,
  percentile,
  printResults,
  register,
  waitForApi,
  freePort,
} from './runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 3));
const CYCLES = Math.max(1, Number(process.env.CYCLES ?? 6));
const USE_EXISTING = process.env.STRESS_USE_EXISTING === '1';
/** Auth endpoints: 5/min per IP — pause between registers. */
const REGISTER_GAP_MS = Number(process.env.REGISTER_GAP_MS ?? 13_000);

async function upsertOpenAiHeuristic(base, token) {
  const res = await apiPost(
    base,
    '/organization/ai-provider',
    { provider: 'openai', apiKey: 'stress-openai-heuristic-key' },
    token,
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `ai-provider upsert failed: HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
}

async function connectYandexMock(base, token, projectId) {
  const start = await apiPost(
    base,
    `/projects/${projectId}/oauth/yandex`,
    {},
    token,
  );
  if (start.status !== 200 && start.status !== 201) {
    throw new Error(
      `oauth start failed: HTTP ${start.status} ${JSON.stringify(start.body)}`,
    );
  }
  const url = start.body?.url;
  if (!url || typeof url !== 'string') {
    throw new Error(`oauth start missing url: ${JSON.stringify(start.body)}`);
  }
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  if (!code || !state) {
    throw new Error(`oauth mock url missing code/state: ${url}`);
  }
  const cb = await fetch(
    `${base}/oauth/yandex/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { redirect: 'manual' },
  );
  const loc = cb.headers.get('location') ?? '';
  if (!loc.includes('oauth=connected')) {
    throw new Error(
      `oauth callback did not connect (status=${cb.status} loc=${loc})`,
    );
  }
}

async function oneCycle(base, idx, auth) {
  const t0 = Date.now();
  const steps = {};
  try {
    await upsertOpenAiHeuristic(base, auth.token);
    steps.aiMs = Date.now() - t0;

    const project = await createProject(base, auth.token, idx);
    const projectId = project.id;
    steps.projectMs = Date.now() - t0;

    await connectYandexMock(base, auth.token, projectId);
    steps.oauthMs = Date.now() - t0;

    const pipe = await apiPost(
      base,
      `/projects/${projectId}/pipeline/run`,
      {},
      auth.token,
    );
    if (pipe.status !== 200 && pipe.status !== 201) {

      throw new Error(
        `pipeline/run HTTP ${pipe.status}: ${JSON.stringify(pipe.body)}`,
      );
    }
    steps.pipelineMs = Date.now() - t0;


    const pub = await apiPost(
      base,
      `/projects/${projectId}/campaigns/publish`,
      {},
      auth.token,
    );
    if (pub.status !== 200 && pub.status !== 201) {

      throw new Error(
        `publish HTTP ${pub.status}: ${JSON.stringify(pub.body)}`,
      );
    }
    steps.publishMs = Date.now() - t0;


    const rep = await apiPost(
      base,
      `/projects/${projectId}/reports/collect`,
      {},
      auth.token,
    );
    if (rep.status !== 200 && rep.status !== 201) {

      throw new Error(
        `reports/collect HTTP ${rep.status}: ${JSON.stringify(rep.body)}`,
      );
    }
    steps.reportsMs = Date.now() - t0;

    const totalMs = Date.now() - t0;

    return { ok: true, ms: totalMs, steps, projectId };
  } catch (err) {
    const totalMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);

    return { ok: false, ms: totalMs, steps, error: message };
  }
}

async function registerAll(base, total) {
  const auths = [];
  for (let i = 0; i < total; i += 1) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, REGISTER_GAP_MS));
    }
    console.log(`[register ${i + 1}/${total}]`);
    try {
      const auth = await register(base, i);
      auths.push(auth);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      throw err;
    }
  }
  return auths;
}

async function runPool(base, auths, concurrency) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= auths.length) return;
      console.log(`[cycle ${idx + 1}/${auths.length}] start`);
      const result = await oneCycle(base, idx, auths[idx]);
      results[idx] = result;
      console.log(
        `[cycle ${idx + 1}/${auths.length}] ${result.ok ? 'OK' : 'FAIL'} ${result.ms}ms` +
          (result.ok ? '' : ` — ${result.error}`),
      );
    }
  });
  await Promise.all(workers);
  return results;
}

async function spawnMockApi(port) {
  const distMain = join(ROOT, 'apps/api/dist/main.js');
  if (!existsSync(distMain)) {
    throw new Error(`Missing ${distMain}. Build api first.`);
  }

  await freePort(port);

  const env = {
    ...process.env,
    API_PORT: String(port),
    PORT: String(port),
    YANDEX_DIRECT_MOCK: '1',
    GOOGLE_ADS_MOCK: '1',
    ATTRIBUTION_MOCK: '1',
    MEDIA_MOCK: '1',
    PIPELINE_QUEUE: 'inline',
    ALERTS_POLL_MS: '0',
    PERFORMANCE_POLL_MS: '0',
    AUTOPILOT_POLL_MS: '0',
    TOKEN_REFRESH_POLL_MS: '0',
    YANDEX_CLIENT_ID: process.env.YANDEX_CLIENT_ID || 'stress-yandex-id',
    YANDEX_CLIENT_SECRET:
      process.env.YANDEX_CLIENT_SECRET || 'stress-yandex-secret',
    YANDEX_REDIRECT_URI: `http://127.0.0.1:${port}/oauth/yandex/callback`,
    WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://127.0.0.1:3000',
    ANTHROPIC_API_KEY: '',
    GROQ_API_KEY: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
  };

  const child = spawn(process.execPath, [distMain], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout.on('data', (buf) => {
    bootLog += buf.toString();
  });
  child.stderr.on('data', (buf) => {
    bootLog += buf.toString();
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForApi(base, 90_000);
  } catch (err) {
    child.kill('SIGTERM');
    throw new Error(
      `${err.message}\n--- api boot log ---\n${bootLog.slice(-4000)}`,
    );
  }
  return { child, base, bootLog };
}

async function main() {
  const { API_BASE } = loadEnv({
    API_PORT: process.env.API_PORT || '3099',
    YANDEX_DIRECT_MOCK: '1',
    GOOGLE_ADS_MOCK: '1',
  });

  const port = Number(process.env.API_PORT || '3099');
  let child = null;
  let base = USE_EXISTING
    ? process.env.API_BASE ||
      `http://127.0.0.1:${process.env.API_PORT || '3001'}`
    : API_BASE;


  if (!USE_EXISTING) {
    console.log(`Spawning mock API on :${port}…`);
    const spawned = await spawnMockApi(port);
    child = spawned.child;
    base = spawned.base;
    console.log(`Mock API ready at ${base}`);
  } else {
    await waitForApi(base, 15_000);
    console.log(`Using existing API at ${base}`);
  }

  console.log(`Registering ${CYCLES} users (gap ${REGISTER_GAP_MS}ms)…`);
  const auths = await registerAll(base, CYCLES);

  const t0 = Date.now();
  const results = await runPool(base, auths, CONCURRENCY);
  const durationMs = Date.now() - t0;

  const ok = results.filter((r) => r?.ok);
  const fail = results.filter((r) => r && !r.ok);
  printResults(
    'full-cycle',
    ok.map((r) => r.ms),
    fail.length,
    durationMs,
  );

  console.log(`\nFailures: ${fail.length}/${results.length}`);
  for (const f of fail) {
    console.log(`  - ${f.error}`);
  }


  if (child) {
    child.kill('SIGTERM');
  }

  if (fail.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);

  process.exit(1);
});
