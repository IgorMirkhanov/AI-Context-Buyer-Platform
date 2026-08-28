"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { DEFAULT_BRANDING, OrgBranding } from "@/lib/branding";
import { GuestShell } from "@/ui/guest-shell";
import { Button } from "@/ui/button";
import { Alert } from "@/ui/alert";
import { PageSkeleton } from "@/ui/states";

type AuthResponse = { accessToken: string };

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const slug = search.get("slug");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    if (!slug) return;
    api<OrgBranding>(`/branding/${encodeURIComponent(slug)}`)
      .then(setBranding)
      .catch(() => undefined);
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(result.accessToken);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setPending(false);
    }
  }

  return (
    <GuestShell branding={branding}>
      <h1 className="mb-6 text-2xl font-semibold">Вход</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          className="ui-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="ui-input"
          type="password"
          minLength={8}
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Входим…" : "Войти"}
        </Button>
      </form>
      {slug ? null : (
        <p className="mt-4 text-sm text-[var(--fg-muted)]">
          Нет аккаунта?{" "}
          <Link href="/register" className="underline">
            Регистрация
          </Link>
          {" · "}
          <Link href="/terms" className="underline">
            Условия
          </Link>
        </p>
      )}
      {slug ? (
        <p className="mt-4 text-sm text-[var(--fg-muted)]">
          <Link href="/terms" className="underline">
            Условия использования
          </Link>
        </p>
      ) : null}
    </GuestShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
