"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { GuestShell } from "@/ui/guest-shell";
import { Button } from "@/ui/button";
import { Alert } from "@/ui/alert";

type AuthResponse = { accessToken: string };

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!acceptTerms) {
      setError("Нужно принять условия использования");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          organizationName,
          acceptTerms: true,
        }),
      });
      setToken(result.accessToken);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setPending(false);
    }
  }

  return (
    <GuestShell>
      <h1 className="mb-6 text-2xl font-semibold">Регистрация</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          className="ui-input"
          placeholder="Название организации"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          required
        />
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
          placeholder="Пароль (минимум 8 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label className="flex items-start gap-2 text-sm text-[var(--fg)]">
          <input
            className="mt-1"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            required
          />
          <span>
            Принимаю{" "}
            <Link href="/terms" className="underline" target="_blank">
              условия использования
            </Link>
            : ответственность за бюджет на агентстве, публикация только после
            подтверждения, кампании создаются на паузе.
          </span>
        </label>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" disabled={pending || !acceptTerms}>
          {pending ? "Создаём…" : "Создать аккаунт"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-[var(--fg-muted)]">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="underline">
          Войти
        </Link>
        {" · "}
        <Link href="/terms" className="underline">
          Условия
        </Link>
      </p>
    </GuestShell>
  );
}
