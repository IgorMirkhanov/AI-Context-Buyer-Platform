import Link from "next/link";
import { btnClass } from "@/ui/button";

/** Public landing for OAuth brand verification (must match Google Auth app name). */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <p className="text-sm uppercase tracking-wide text-[var(--fg-muted)]">
        Contextual advertising · Yandex Direct & Google Ads
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Context Buyer</h1>
      <p className="text-lg text-[var(--fg-muted)]">AI Context-Buyer Platform</p>
      <p className="text-[var(--fg-muted)]">
        B2B workspace for agencies and contextologists. Build semantics, ads and
        campaign drafts per client project. Publish to ad accounts only after
        explicit confirmation in the UI; new campaigns start paused.
      </p>
      <p className="text-[var(--fg-muted)]">
        When you connect Google Ads, Context Buyer requests OAuth access to your
        Google Ads account so we can sync campaigns, pull reporting and create
        paused drafts on your behalf. We do not publish live ads without your
        confirmation. Details:{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="text-sm text-[var(--fg-muted)]">
        Контекстная реклама для агентств: семантика, объявления и черновики
        кампаний по проектам. Публикация — только после вашего подтверждения.
        Подключение Google Ads — через OAuth для синхронизации кабинета и
        отчётов; см.{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className={btnClass("primary")}>
          Регистрация
        </Link>
        <Link href="/login" className={btnClass("secondary")}>
          Войти
        </Link>
        <Link href="/privacy" className={btnClass("ghost")}>
          Privacy
        </Link>
        <Link href="/terms" className={btnClass("ghost")}>
          Terms
        </Link>
      </div>
    </main>
  );
}
