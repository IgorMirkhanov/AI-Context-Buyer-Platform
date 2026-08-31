"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { GuestShell } from "@/ui/guest-shell";
import { Button } from "@/ui/button";
import { Alert } from "@/ui/alert";

type AuthResponse = { accessToken: string };

function InviteForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = useMemo(() => search.get("token") ?? "", [search]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<AuthResponse>("/auth/invite", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setToken(result.accessToken);
      router.push("/projects");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось принять приглашение",
      );
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <Alert tone="danger">В ссылке нет токена приглашения.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        className="ui-input"
        type="password"
        minLength={8}
        placeholder="Пароль (минимум 8 символов)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Войти в кабинет"}
      </Button>
    </form>
  );
}

export default function InvitePage() {
  return (
    <GuestShell>
      <h1 className="mb-2 text-2xl font-semibold">Приглашение</h1>
      <p className="mb-6 text-sm text-[var(--fg-muted)]">
        Задайте пароль, чтобы войти в назначенные проекты.
      </p>
      <Suspense fallback={<p className="text-sm text-[var(--fg-muted)]">Загрузка…</p>}>
        <InviteForm />
      </Suspense>
    </GuestShell>
  );
}
