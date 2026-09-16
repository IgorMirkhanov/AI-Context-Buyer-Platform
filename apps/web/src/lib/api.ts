"use client";

import { localizeApiError } from "./api-errors";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 600;
/** Avoid infinite skeleton when API accepts TCP but never responds. */
const FETCH_TIMEOUT_MS = 20_000;
/** Google/Yandex publish does many sequential API writes. */
const LONG_FETCH_TIMEOUT_MS = 180_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLongRunningPath(path: string, method?: string): boolean {
  const m = (method ?? "GET").toUpperCase();
  if (m !== "POST") return false;
  return (
    /\/campaigns\/publish$/i.test(path) ||
    /\/pipeline\/run$/i.test(path) ||
    /\/semantic\/run$/i.test(path) ||
    /\/creatives\/run$/i.test(path)
  );
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: options.signal ?? controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  const raw =
    lastError instanceof Error
      ? /abort/i.test(lastError.message) || lastError.name === "AbortError"
        ? "Сервер не отвечает. Проверьте, что API запущен на порту 3001."
        : lastError.message
      : "Failed to fetch";
  throw new Error(localizeApiError(raw));
}

const TOKEN_KEY = "cb_access_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const timeoutMs = isLongRunningPath(path, options.method)
    ? LONG_FETCH_TIMEOUT_MS
    : FETCH_TIMEOUT_MS;
  const res = await fetchWithRetry(
    `${API_URL}${path}`,
    { ...options, headers },
    timeoutMs,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new Error(message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function downloadAuthenticated(
  path: string,
  filename: string,
): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetchWithRetry(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
