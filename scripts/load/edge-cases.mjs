/**
 * Edge / adversarial probes against mock API (port 3098 by default).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiGet,
  apiPost,
  createProject,
  loadEnv,
  register,
  waitForApi,
  freePort,
} from './runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const port = Number(process.env.API_PORT || '3098');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function upsertOpenAi(base, token) {
  const res = await apiPost(
    base,
    '/organization/ai-provider',
    { provider: 'openai', apiKey: 'stress-openai-heuristic-key' },
    token,
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`ai upsert ${res.status}`);
  }
}

async function connectMock(base, token, projectId, platform) {
  const path =
    platform === 'google_ads'
      ? `/projects/${projectId}/oauth/google`
      : `/projects/${projectId}/oauth/yandex`;
  const start = await apiPost(base, path, {}, token);
  if (start.status !== 200 && start.status !== 201) {
    throw new Error(`oauth start ${platform} ${start.status} ${JSON.stringify(start.body)}`);
  }
  const url = start.body?.url;
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const cbPath =
    platform === 'google_ads'
      ? '/oauth/google-ads/callback'
      : '/oauth/yandex/callback';
  const cb = await fetch(
    `${base}${cbPath}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { redirect: 'manual' },
  );
  const loc = cb.headers.get('location') ?? '';
  if (!loc.includes('oauth=connected')) {
    throw new Error(`oauth ${platform} not connected loc=${loc}`);
  }
}

async function spawnApi() {
  const distMain = join(ROOT, 'apps/api/dist/main.js');
  if (!existsSync(distMain)) throw new Error('build api first');
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
    YANDEX_CLIENT_ID: 'stress',
    YANDEX_CLIENT_SECRET: 'stress',
    YANDEX_REDIRECT_URI: `http://127.0.0.1:${port}/oauth/yandex/callback`,
    GOOGLE_ADS_CLIENT_ID: 'stress-g',
    GOOGLE_ADS_CLIENT_SECRET: 'stress-g',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'stress-g',
    GOOGLE_ADS_REDIRECT_URI: `http://127.0.0.1:${port}/oauth/google-ads/callback`,
    WEB_ORIGIN: 'http://127.0.0.1:3000',
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
  let boot = '';
  child.stdout.on('data', (b) => (boot += b));
  child.stderr.on('data', (b) => (boot += b));
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForApi(base, 90_000);
  } catch (e) {
    child.kill();
    throw new Error(`${e.message}\n${boot.slice(-3000)}`);
  }
  return { child, base };
}

async function fullPlatformCycle(base, idx, platform) {
  const auth = await register(base, 1000 + idx);
  await upsertOpenAi(base, auth.token);
  const project = await createProject(base, auth.token, 1000 + idx, {
    primaryPlatform: platform,
  });
  await connectMock(base, auth.token, project.id, platform);
  const pipe = await apiPost(
    base,
    `/projects/${project.id}/pipeline/run`,
    {},
    auth.token,
  );
  if (pipe.status !== 200 && pipe.status !== 201) {
    return { ok: false, step: 'pipeline', detail: pipe };
  }
  const pub = await apiPost(
    base,
    `/projects/${project.id}/campaigns/publish`,
    {},
    auth.token,
  );
  if (pub.status !== 200 && pub.status !== 201) {
    return { ok: false, step: 'publish', detail: pub };
  }
  const rep = await apiPost(
    base,
    `/projects/${project.id}/reports/collect`,
    {},
    auth.token,
  );
  if (rep.status !== 200 && rep.status !== 201) {
    return { ok: false, step: 'reports', detail: rep };
  }
  return { ok: true, projectId: project.id, stage: pipe.body?.stage };
}

async function main() {
  loadEnv({ API_PORT: String(port) });
  const { child, base } = await spawnApi();
  console.log('edge API', base);
  const failures = [];

  try {
    // H-B: pipeline without AI
    {
      const auth = await register(base, 1);
      await sleep(13_000);
      const project = await createProject(base, auth.token, 1);
      const pipe = await apiPost(
        base,
        `/projects/${project.id}/pipeline/run`,
        {},
        auth.token,
      );
      const pass = pipe.status === 400;

      console.log(pass ? 'PASS' : 'FAIL', 'no-AI pipeline → 400', pipe.status);
      if (!pass) failures.push('no-AI should 400');
    }

    // H-D: Google full cycle
    await sleep(13_000);
    {
      const g = await fullPlatformCycle(base, 2, 'google_ads');

      console.log(g.ok ? 'PASS' : 'FAIL', 'google full cycle', g.ok ? '' : JSON.stringify(g.detail).slice(0, 400));
      if (!g.ok) failures.push(`google: ${g.step}`);
    }

    // H-A: concurrent register burst (expect some 429)
    {
      const burst = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          apiPost(base, '/auth/register', {
            email: `burst_${Date.now()}_${i}@stress.local`,
            password: 'StressPass1!',
            organizationName: `Burst_${i}`,
            acceptTerms: true,
          }),
        ),
      );
      const statuses = burst.map((r) => r.status);
      const throttled = statuses.filter((s) => s === 429).length;
      const created = statuses.filter((s) => s === 200 || s === 201).length;

      console.log(
        'INFO',
        `register burst created=${created} throttled=${throttled}`,
        statuses.join(','),
      );
      // Not a failure if throttle works — failure if all succeed beyond limit silently broken
      if (throttled === 0 && created === 8) {
        failures.push('register throttle did not fire on 8 concurrent');
      }
    }

    // Double publish idempotency (wait for auth IP throttle window after burst)
    await sleep(65_000);
    {
      const auth = await register(base, 50);
      await upsertOpenAi(base, auth.token);
      const project = await createProject(base, auth.token, 50);
      await connectMock(base, auth.token, project.id, 'yandex_direct');
      await apiPost(base, `/projects/${project.id}/pipeline/run`, {}, auth.token);
      const p1 = await apiPost(
        base,
        `/projects/${project.id}/campaigns/publish`,
        {},
        auth.token,
      );
      const p2 = await apiPost(
        base,
        `/projects/${project.id}/campaigns/publish`,
        {},
        auth.token,
      );

      const pass = (p1.status === 200 || p1.status === 201) && (p2.status === 200 || p2.status === 201);
      console.log(pass ? 'PASS' : 'FAIL', 'double publish', p1.status, p2.status, JSON.stringify(p2.body).slice(0, 200));
      if (!pass) failures.push('double publish');
    }

    // Authenticated burst: same user 120 GETs — should use user tracker, not shared IP death
    await sleep(13_000);
    {
      const auth = await register(base, 60);
      const hits = await Promise.all(
        Array.from({ length: 120 }, () => apiGet(base, '/projects', auth.token)),
      );
      const statuses = hits.map((h) => h.status);
      const ok = statuses.filter((s) => s === 200).length;
      const r429 = statuses.filter((s) => s === 429).length;

      console.log('INFO', `auth burst ok=${ok} 429=${r429}`);
      // Global limit 100/min per tracker — expect some 429 after 100
      if (ok < 90) failures.push('auth burst too many failures');
    }
  } finally {
    child.kill('SIGTERM');
  }

  console.log('\nFailures:', failures.length ? failures.join('; ') : 'none');
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);

  process.exit(1);
});
