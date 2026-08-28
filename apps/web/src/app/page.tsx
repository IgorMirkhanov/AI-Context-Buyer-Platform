import Link from "next/link";
import { btnClass } from "@/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <p className="text-sm uppercase tracking-wide text-[var(--fg-muted)]">
        Контекстная реклама · Яндекс Директ и Google Ads
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        AI Context-Buyer Platform
      </h1>
      <p className="text-[var(--fg-muted)]">
        Мультиагентная SaaS-платформа для полного цикла работы контекстолога.
        Семантика, объявления и черновик кампании собираются по проекту.
        Публикация — только после вашего подтверждения, кампания выходит на
        паузе.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className={btnClass("primary")}>
          Регистрация
        </Link>
        <Link href="/login" className={btnClass("secondary")}>
          Войти
        </Link>
        <Link href="/terms" className={btnClass("ghost")}>
          Условия
        </Link>
      </div>
    </main>
  );
}
