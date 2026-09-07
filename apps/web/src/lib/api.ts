"use client";

import { localizeApiError } from "./api-errors";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  const raw =
    lastError instanceof Error ? lastError.message : "Failed to fetch";
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

  const res = await fetchWithRetry(`${API_URL}${path}`, { ...options, headers });
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
