import Link from "next/link";
import { Card } from "@/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use · Context Buyer",
  description:
    "Terms of use for Context Buyer (AI Context-Buyer Platform).",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <p className="mb-4 text-sm text-[var(--fg-muted)]">
        <Link href="/" className="underline">
          Context Buyer — home
        </Link>
      </p>
      <Card>
        <h1 className="mb-2 text-2xl font-semibold">Terms of Use</h1>
        <p className="mb-6 text-sm text-[var(--fg-muted)]">
          Context Buyer (AI Context-Buyer Platform) · Contact:
          igor.mirkhanov@mail.ru
        </p>
        <div className="flex flex-col gap-4 text-sm leading-6 text-[var(--fg)]">
          <p>
            <strong>Context Buyer</strong> helps agencies and contextologists
            build semantics, ads and campaign drafts. It is a software tool, not
            an independent advertiser spending your budget by itself.
          </p>
          <p>
            <strong>Budget responsibility</strong> stays with the organization
            that runs campaigns (agency or client). The platform does not
            reimburse overspend, wrong bids or outcomes of actions confirmed in
            the UI or ad cabinet.
          </p>
          <p>
            <strong>Manual publish only.</strong> Campaigns are not created in
            Yandex Direct or Google Ads automatically. Writes to an ad account
            happen only after explicit confirmation in the interface. New
            campaigns are created paused (no delivery until you enable them).
          </p>
          <p>
            <strong>Autopilot is opt-in.</strong> Daily adjustments (pause,
            budget, negatives) never enable themselves. Autopilot is limited to
            those actions and does not create campaigns.
          </p>
          <p>
            Review agent outputs before launch. In-product explanations help
            understanding but do not replace professional judgment.
          </p>
          <p className="border-t border-[var(--border)] pt-4">
            <strong>Условия (RU).</strong> Context Buyer — инструмент агентства,
            не самостоятельный рекламодатель. Ответственность за бюджет — на
            организации. Публикация только вручную, кампании на паузе.
            Автопилот — отдельное согласие. Подробнее о данных:{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <p className="mt-6 text-sm text-[var(--fg-muted)]">
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          {" · "}
          <Link href="/register" className="underline">
            Register
          </Link>
          {" · "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
