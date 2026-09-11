import Link from "next/link";
import { Card } from "@/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Context Buyer",
  description:
    "Privacy policy for Context Buyer (AI Context-Buyer Platform): data we collect, OAuth tokens, and how we use them.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <p className="mb-4 text-sm text-[var(--fg-muted)]">
        <Link href="/" className="underline">
          Context Buyer — home
        </Link>
      </p>
      <Card>
        <h1 className="mb-2 text-2xl font-semibold">Privacy Policy</h1>
        <p className="mb-6 text-sm text-[var(--fg-muted)]">
          Context Buyer (AI Context-Buyer Platform) · Last updated: 11 September
          2026 · Contact: igor.mirkhanov@mail.ru
        </p>
        <div className="flex flex-col gap-4 text-sm leading-6 text-[var(--fg)]">
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">1. Who we are</h2>
            <p>
              Context Buyer is a B2B software tool for advertising agencies and
              performance marketers. It helps manage contextual advertising
              workflows (briefs, semantics, creatives, campaign drafts) for
              multiple client projects. It is not a consumer social app.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">2. Data we collect</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Account data:</strong> email address, password hash,
                organization name, role.
              </li>
              <li>
                <strong>Project / brief data:</strong> website URL, geo, budget
                plan, USPs, audience notes, negative keywords and related
                marketing inputs you enter.
              </li>
              <li>
                <strong>Advertising platform OAuth:</strong> when you connect
                Yandex Direct or Google Ads, we receive access and refresh tokens
                and account identifiers needed to call those APIs on your behalf.
              </li>
              <li>
                <strong>Operational data:</strong> campaign drafts, sync and
                reporting snapshots, agent task status, audit events of write
                actions, aggregated LLM usage metrics (not full secrets).
              </li>
              <li>
                <strong>Technical logs:</strong> request metadata such as
                timestamps and request IDs. We do not intentionally log raw
                OAuth tokens or API keys.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">3. How we use data</h2>
            <p>We use this information only to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>authenticate users and isolate data by organization / project;</li>
              <li>
                run the product pipeline (semantics, creatives, drafts, reports);
              </li>
              <li>
                call Yandex Direct / Google Ads APIs after you connect a cabinet;
              </li>
              <li>provide support and improve reliability and security.</li>
            </ul>
            <p>
              We do <strong>not</strong> sell personal data. We do not use Google
              user data for advertising to end consumers or for unrelated AI
              training outside operating this product for your organization.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">
              4. Google user data (Limited Use)
            </h2>
            <p>
              If you authorize Google Ads OAuth, Context Buyer accesses Google
              Ads account data solely to provide the features you request
              (connect account, sync campaigns, reporting, paused campaign
              creation after explicit confirmation). Use of information received
              from Google APIs will adhere to the{" "}
              <a
                className="underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">5. Storage and security</h2>
            <p>
              OAuth tokens are stored encrypted at rest, scoped to a project.
              Access is restricted by authentication and project membership.
              Passwords are stored as irreversible hashes.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">6. Sharing</h2>
            <p>
              We share data with subprocessors only as needed to run the service
              (hosting, database, email if used). Ad platform APIs receive
              requests using tokens you authorized. We do not share your Google
              or Yandex tokens with unrelated third parties.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">7. Retention and deletion</h2>
            <p>
              We keep account and project data while your organization uses the
              product. You may request deletion of your account and associated
              project data by contacting us; we will delete or anonymize data
              except where retention is required by law or security logs.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">8. Contact</h2>
            <p>
              Privacy questions:{" "}
              <a className="underline" href="mailto:igor.mirkhanov@mail.ru">
                igor.mirkhanov@mail.ru
              </a>
            </p>
          </section>

          <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
            <h2 className="text-base font-semibold">Политика конфиденциальности (RU)</h2>
            <p>
              Context Buyer (AI Context-Buyer Platform) — B2B-инструмент для
              агентств и контекстологов. Мы обрабатываем email и данные аккаунта,
              брифы проектов, OAuth-токены Яндекс Директа / Google Ads (в
              зашифрованном виде), операционные логи задач и аудита. Данные
              используются только для работы сервиса по вашему поручению. Мы не
              продаём персональные данные. Публикация кампаний — только после
              явного подтверждения в интерфейсе. Запросы на удаление и вопросы:
              igor.mirkhanov@mail.ru.
            </p>
          </section>
        </div>
        <p className="mt-6 text-sm text-[var(--fg-muted)]">
          <Link href="/terms" className="underline">
            Terms of use
          </Link>
          {" · "}
          <Link href="/" className="underline">
            Home
          </Link>
        </p>
      </Card>
    </main>
  );
}
