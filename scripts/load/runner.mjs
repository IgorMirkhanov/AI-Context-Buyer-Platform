/**
 * scripts/load/runner.mjs
 * Общие утилиты для нагрузочных тестов.
 * Использование: импортировать из отдельных сценариев.
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// ── Env ──────────────────────────────────────────────────────────────────────

export function loadEnv(extra = {}) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) loadDotenv({ path: envPath });

  // Нагрузочный тест — строго mock-режим
  const defaults = {
    NODE_ENV: 'test',
    GOOGLE_ADS_MOCK: '1',
    YANDEX_DIRECT_MOCK: '1',
    ATTRIBUTION_MOCK: '1',
    MEDIA_MOCK: '1',
    PIPELINE_QUEUE: 'inline',
    API_PORT: '3099',
    ALERTS_POLL_MS: '0',
    PERFORMANCE_POLL_MS: '0',
    AUTOPILOT_POLL_MS: '0',
    TOKEN_REFRESH_POLL_MS: '0',
    ...extra,
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k]) process.env[k] = v;
  }
  return {
    API_BASE: `http://127.0.0.1:${process.env.API_PORT}`,
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

export async function apiPost(base, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export async function apiGet(base, path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function register(base, idx) {
  const ts = Date.now();
  const email = `load_${ts}_${idx}@stress.local`;
  const password = 'StressPass1!';
  const res = await apiPost(base, '/auth/register', {
    email,
    password,
    organizationName: `StressOrg_${ts}_${idx}`,
    acceptTerms: true,
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register failed [${idx}]: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return { email, password, token: res.body.accessToken, user: res.body.user };
}

export async function login(base, email, password) {
  const res = await apiPost(base, '/auth/login', { email, password });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`login failed for ${email}: HTTP ${res.status}`);
  }
  return res.body.accessToken;
}

export async function createProject(base, token, idx, overrides = {}) {
  const ts = Date.now();
  const res = await apiPost(base, '/projects', {
    name: `StressProject_${ts}_${idx}`,
    primaryPlatform: 'yandex_direct',
    websiteUrl: 'https://example.com',
    geo: ['RU-MOW'],
    budgetDaily: 1000,
    usp: ['Быстро', 'Дёшево'],
    targetAudience: [{ segment: 'B2B', pains: ['дорого'], objections: [] }],
    globalNegativeKeywords: [],
    ...overrides,
  }, token);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createProject failed [${idx}]: HTTP ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

// ── Latency measurement ───────────────────────────────────────────────────────

export function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function printResults(label, samples, errors, durationMs) {
  const total = samples.length + errors;
  const rps = Math.round((total / durationMs) * 1000);
  const errorRate = total > 0 ? errors / total : 0;
  console.log(`\n--- ${label} ---`);
  console.log(`  Requests  : ${total} (${errors} errors)`);
  console.log(`  Duration  : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  RPS       : ${rps}`);
  console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}%`);
  if (samples.length > 0) {
    console.log(`  p50       : ${percentile(samples, 50)}ms`);
    console.log(`  p95       : ${percentile(samples, 95)}ms`);
    console.log(`  p99       : ${percentile(samples, 99)}ms`);
    console.log(`  max       : ${Math.max(...samples)}ms`);
  }
  return {
    rps, errorRate,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
  };
}

// ── Wait for API ──────────────────────────────────────────────────────────────

export async function waitForApi(base, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`API ${base}/health did not become healthy in ${timeoutMs}ms`);
}

/** Best-effort free a TCP port on Windows/Unix before spawning stress API. */
export async function freePort(port) {
  if (process.platform === 'win32') {
    try {
      const { execSync } = await import('node:child_process');
      const out = execSync(
        `netstat -ano | findstr :${port}`,
        { encoding: 'utf8' },
      );
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch { /* ignore */ }
      }
    } catch { /* nothing listening */ }
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  try {
    const { execSync } = await import('node:child_process');
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
  } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 500));
}
