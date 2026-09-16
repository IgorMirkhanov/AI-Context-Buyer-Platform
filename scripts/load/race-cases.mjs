/**
 * Race probes: concurrent pipeline must not corrupt clusters;
 * dirty Google keywords + publish must succeed.
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
const port = Number(process.env.API_PORT || '3097');

async function upsertOpenAi(base, token) {
  await apiPost(
    base,
    '/organization/ai-provider',
    { provider: 'openai', apiKey: 'stress-openai-heuristic-key' },
    token,
  );
}

async function connectGoogle(base, token, projectId) {
  const start = await apiPost(
    base,
    `/projects/${projectId}/oauth/google`,
    {},
    token,
  );
  const url = new URL(start.body.url);
  const cb = await fetch(
    `${base}/oauth/google-ads/callback?code=${encodeURIComponent(url.searchParams.get('code'))}&state=${encodeURIComponent(url.searchParams.get('state'))}`,
    { redirect: 'manual' },
  );
  if (!(cb.headers.get('location') || '').includes('oauth=connected')) {
    throw new Error('google oauth failed');
  }
}

async function spawnApi() {
  const distMain = join(ROOT, 'apps/api/dist/main.js');
  if (!existsSync(distMain)) throw new Error('build api');
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
  const base = `http://127.0.0.1:${port}`;
  await waitForApi(base, 90_000);
  return { child, base };
}

async function main() {
  loadEnv({ API_PORT: String(port) });
  const { child, base } = await spawnApi();
  const failures = [];
  try {
    const auth = await register(base, 1);
    await upsertOpenAi(base, auth.token);
    const project = await createProject(base, auth.token, 1, {
      primaryPlatform: 'google_ads',
      usp: ['Купить!!! ноутбуки @office #sale'],
      globalNegativeKeywords: ['бесплатно!!!', 'скачать@torrent'],
    });
    await connectGoogle(base, auth.token, project.id);

    const pipes = await Promise.all(
      Array.from({ length: 5 }, () =>
        apiPost(base, `/projects/${project.id}/pipeline/run`, {}, auth.token),
      ),
    );
    const pipeStatuses = pipes.map((p) => p.status);
    const pipeOk = pipeStatuses.filter((s) => s === 200 || s === 201).length;
    const pipeConflict = pipeStatuses.filter((s) => s === 409).length;
    const assignedTwice = pipes.some((p) =>
      JSON.stringify(p.body).includes('assigned twice'),
    );

    console.log(
      'INFO concurrent pipeline',
      pipeStatuses.join(','),
      `ok=${pipeOk} conflict=${pipeConflict}`,
    );
    if (pipeOk < 1) failures.push('no successful pipeline');
    if (assignedTwice) failures.push('assigned twice still present');
    if (pipeOk + pipeConflict < 5) {
      failures.push(`unexpected statuses: ${pipeStatuses.join(',')}`);
    }

    // Ensure draft exists for publish (retry once if winner finished after conflicts)
    let stage = pipes.find((p) => p.status === 200 || p.status === 201)?.body
      ?.stage;
    if (stage !== 'awaiting_approval') {
      const retry = await apiPost(
        base,
        `/projects/${project.id}/pipeline/run`,
        {},
        auth.token,
      );

      stage = retry.body?.stage;
      if (retry.status !== 200 && retry.status !== 201) {
        failures.push(`retry pipeline ${retry.status}`);
      }
    }

    const sem = await apiGet(
      base,
      `/projects/${project.id}/semantic`,
      auth.token,
    );
    const clusters = sem.body?.clusters ?? sem.body?.result?.clusters ?? [];
    const names = clusters.map((c) => c.name ?? c.cluster_name);
    const uniqueNames = new Set(names.map((n) => String(n).toLowerCase()));

    console.log('INFO clusters', names.length, 'unique', uniqueNames.size);
    if (names.length > 0 && names.length !== uniqueNames.size) {
      failures.push('duplicate cluster names remain');
    }

    if (clusters[0]?.id) {
      const edit = await apiPost(
        base,
        `/projects/${project.id}/semantic/keywords`,
        {
          clusterId: clusters[0].id,
          action: 'add',
          phrases: ['купить ноутбук!!!', 'laptop — office', '100% скидка'],
        },
        auth.token,
      );

      console.log('INFO semantic edit', edit.status);
      if (edit.status !== 200 && edit.status !== 201) {
        failures.push(`semantic edit ${edit.status}`);
      }
    }

    const pubs = await Promise.all(
      Array.from({ length: 4 }, () =>
        apiPost(
          base,
          `/projects/${project.id}/campaigns/publish`,
          {},
          auth.token,
        ),
      ),
    );
    const pubStatuses = pubs.map((p) => p.status);
    const pubOk = pubStatuses.filter((s) => s === 200 || s === 201).length;

    console.log('INFO concurrent publish', pubStatuses.join(','));
    const pubConflict = pubStatuses.filter((s) => s === 409).length;
    if (pubOk === 0) failures.push('all concurrent publishes failed');
    if (pubOk + pubConflict < 4) {
      failures.push(`unexpected publish statuses: ${pubStatuses.join(',')}`);
    }

    const result = pubs.find((p) => p.status === 200 || p.status === 201);
    const campaigns = result?.body?.campaigns ?? [];

    console.log(
      'INFO campaigns',
      campaigns.length,
      `ok=${pubOk} conflict=${pubConflict}`,
      campaigns.map((c) => c.status).join(','),
    );
    // Google dirty USP typically yields 1–2 search units; never 4× that from a race.
    if (campaigns.length === 0) failures.push('no campaigns after publish');
    if (campaigns.length > 3) {
      failures.push(`too many campaigns after concurrent publish: ${campaigns.length}`);
    }
  } finally {
    child.kill('SIGTERM');
  }

  console.log('Failures:', failures.length ? failures.join('; ') : 'none');
  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);

  process.exit(1);
});
