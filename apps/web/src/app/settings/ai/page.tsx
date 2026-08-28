"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";
import { DEFAULT_BRANDING, OrgBranding } from "@/lib/branding";
import { AppShell } from "@/shell/app-shell";
import { Button } from "@/ui/button";
import { Card, CardHint, CardTitle } from "@/ui/card";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { ErrorState, PageSkeleton } from "@/ui/states";

type ProviderName = "anthropic" | "openai";

type ProviderStatus = {
  provider: ProviderName;
  configured: boolean;
  status: "missing" | "unverified" | "valid" | "invalid";
  source: "database" | "env" | null;
  keyHint: string | null;
  lastVerifiedAt: string | null;
};

type StatusResponse = {
  ready: boolean;
  ok?: boolean;
  providers: ProviderStatus[];
};

type Me = {
  email: string;
  canWrite: boolean;
  organizationName: string;
  branding: OrgBranding;
  beginnerMode: boolean;
};

const LABELS: Record<ProviderName, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

function providerBadge(item: ProviderStatus) {
  if (!item.configured) return { kind: "draft" as const, label: "не задан" };
  if (item.status === "valid")
    return { kind: "success" as const, label: "подключён" };
  if (item.status === "invalid")
    return { kind: "danger" as const, label: "ключ отклонён" };
  return { kind: "alert" as const, label: "не проверен" };
}

export default function AiProviderSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [provider, setProvider] = useState<ProviderName>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const [user, current] = await Promise.all([
      api<Me>("/auth/me"),
      api<StatusResponse>("/organization/ai-provider"),
    ]);
    setMe(user);
    setStatus(current);
    setLoadError(null);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((err) => {
      const message = err instanceof Error ? err.message : "";
      if (/401|unauthorized|не авторизован/i.test(message)) {
        clearToken();
        router.replace("/login");
        return;
      }
      setLoadError(message || "Не удалось загрузить настройки");
    });
  }, [router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const next = await api<StatusResponse>("/organization/ai-provider", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
      });
      setStatus(next);
      setApiKey("");
      setInfo("Ключ сохранён. Нажмите «Проверить подключение».");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить ключ");
    } finally {
      setPending(false);
    }
  }

  async function onVerify() {
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const next = await api<StatusResponse>(
        "/organization/ai-provider/verify",
        {
          method: "POST",
          body: JSON.stringify({
            provider,
            apiKey: apiKey.trim() ? apiKey : undefined,
          }),
        },
      );
      setStatus(next);
      setApiKey("");
      setInfo(
        next.ok
          ? "Подключение подтверждено."
          : "Провайдер отклонил ключ. Проверьте значение и повторите.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось проверить ключ",
      );
    } finally {
      setPending(false);
    }
  }

  if (loadError && !me) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <ErrorState message={loadError} onRetry={() => void load()} />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <PageSkeleton />
      </main>
    );
  }

  const branding = me.branding ?? DEFAULT_BRANDING;

  return (
    <AppShell
      branding={branding}
      orgName={me.organizationName}
      email={me.email}
      canWrite={me.canWrite}
      beginnerMode={me.beginnerMode !== false}
      onBeginnerModeChange={(value) =>
        setMe((prev) => (prev ? { ...prev, beginnerMode: value } : prev))
      }
      current="settings"
      onLogout={() => router.replace("/login")}
    >
      <h1 className="mb-1 text-2xl font-semibold">Настройки</h1>
      <h2 className="mb-4 text-lg font-medium">ИИ-провайдер</h2>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">
        Ключ хранится в организации (AES-256-GCM), не в проекте и не в логах.
        Локально и в CI можно задать <code>ANTHROPIC_API_KEY</code> /{" "}
        <code>OPENAI_API_KEY</code> — в проде приоритет у ключа из этой формы.
      </p>

      <ul className="mb-4 flex flex-col gap-2 text-sm">
        {(status?.providers ?? []).map((item) => {
          const badge = providerBadge(item);
          return (
            <li
              key={item.provider}
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
            >
              <span className="font-medium">{LABELS[item.provider]}</span>
              <Badge kind={badge.kind}>{badge.label}</Badge>
              {item.keyHint ? (
                <span className="text-[var(--fg-muted)]">{item.keyHint}</span>
              ) : null}
              {item.source === "env" ? (
                <span className="text-[var(--fg-muted)]">
                  из переменной окружения
                </span>
              ) : null}
              {item.lastVerifiedAt ? (
                <span className="text-[var(--fg-muted)]">
                  проверка {new Date(item.lastVerifiedAt).toLocaleString("ru")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {me.canWrite ? (
        <Card>
          <form onSubmit={onSave} className="flex flex-col gap-3">
            <CardTitle>Ключ организации</CardTitle>
            <CardHint>
              После сохранения нажмите «Проверить подключение», чтобы агенты
              начали вызовы.
            </CardHint>
            <label className="text-sm">
              Провайдер
              <select
                className="ui-input mt-1"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderName)}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label className="text-sm">
              API-ключ
              <input
                className="ui-input mt-1"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Вставьте ключ"
                minLength={8}
                required
              />
            </label>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {info ? <Alert tone="info">{info}</Alert> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Сохраняем…" : "Сохранить ключ"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={onVerify}
              >
                Проверить подключение
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Alert tone="info">Ключ может задать только сотрудник агентства.</Alert>
      )}
    </AppShell>
  );
}
