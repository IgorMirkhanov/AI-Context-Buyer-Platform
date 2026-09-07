"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";
import { errorMessage } from "@/lib/api-errors";
import { DEFAULT_BRANDING, OrgBranding } from "@/lib/branding";
import { AppShell } from "@/shell/app-shell";
import { Button } from "@/ui/button";
import { Card, CardHint, CardTitle } from "@/ui/card";
import { Alert } from "@/ui/alert";
import { ErrorState, PageSkeleton } from "@/ui/states";
import { KpiCard, KpiGrid, PageHeader } from "@/ui/kpi";
import { PortfolioTable, type PortfolioRow } from "@/components/portfolio-table";
import { ProjectCreateWizard } from "@/components/project-create-wizard";

type Me = {
  email: string;
  role: string;
  organizationName: string;
  canWrite: boolean;
  branding: OrgBranding;
  beginnerMode: boolean;
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProjectsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<PortfolioRow[]>([]);
  const [name, setName] = useState("");
  const [primaryPlatform, setPrimaryPlatform] = useState("yandex_direct");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [geo, setGeo] = useState("RU-MOW");
  const [budgetDaily, setBudgetDaily] = useState("5000");
  const [usp, setUsp] = useState("");
  const [audience, setAudience] = useState("");
  const [negatives, setNegatives] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteHint, setInviteHint] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#8083ff");
  const [hideBadge, setHideBadge] = useState(false);
  const creatingRef = useRef(false);

  async function load() {
    const [user, list] = await Promise.all([
      api<Me>("/auth/me"),
      api<PortfolioRow[]>("/projects/portfolio"),
    ]);
    setMe(user);
    setProjects(list);
    const branding = user.branding ?? DEFAULT_BRANDING;
    setProductName(branding.productName);
    setSlug(branding.slug ?? "");
    setLogoUrl(branding.logoUrl ?? "");
    setAccentColor(branding.accentColor);
    setHideBadge(branding.hidePlatformBadge);
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
      setLoadError(errorMessage(err, "Не удалось загрузить проекты"));
    });
  }, [router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setError(null);
    try {
      const created = await api<{ id: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          primaryPlatform,
          websiteUrl,
          geo: splitList(geo),
          budgetDaily: Number(budgetDaily),
          budgetCurrency: "RUB",
          usp: splitList(usp),
          targetAudience: splitList(audience).map((segment) => ({ segment })),
          globalNegativeKeywords: splitList(negatives),
        }),
      });
      router.push(`/projects/${created.id}`);
    } catch (err) {
      creatingRef.current = false;
      setError(err instanceof Error ? err.message : "Не удалось создать проект");
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteHint(null);
    try {
      const branding = await api<OrgBranding>("/organization/branding", {
        method: "PATCH",
        body: JSON.stringify({
          productName,
          slug: slug.trim() || null,
          logoUrl: logoUrl.trim() || null,
          accentColor,
          hidePlatformBadge: hideBadge,
        }),
      });
      setMe((prev) => (prev ? { ...prev, branding } : prev));
      setInviteHint(
        branding.slug
          ? `Белый кабинет: /login?slug=${branding.slug}`
          : "Брендинг сохранён",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить брендинг");
    }
  }

  const portfolioStats = useMemo(() => {
    const spend7d = projects.reduce((sum, row) => sum + row.spend7d, 0);
    const conversions7d = projects.reduce(
      (sum, row) => sum + row.conversions7d,
      0,
    );
    const alerts = projects.reduce((sum, row) => sum + row.unreadAlerts, 0);
    const active = projects.filter((row) => row.campaignStatus === "active").length;
    const withCpl = projects.filter((row) => row.cpl7d != null);
    const avgCpl =
      withCpl.length === 0
        ? null
        : withCpl.reduce((sum, row) => sum + (row.cpl7d ?? 0), 0) / withCpl.length;
    return { spend7d, conversions7d, alerts, active, avgCpl, total: projects.length };
  }, [projects]);

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
      canManageOrg={me.role === "owner"}
      beginnerMode={me.beginnerMode !== false}
      onBeginnerModeChange={(value) =>
        setMe((prev) => (prev ? { ...prev, beginnerMode: value } : prev))
      }
      current="projects"
      wide
      onLogout={() => router.replace("/login")}
    >
      <PageHeader
        title="Портфель проектов"
        description="Клиентские проекты · Яндекс Директ и Google Ads · без автопубликации"
      />

      <KpiGrid cols={4}>
        <KpiCard
          label="Проекты"
          value={String(portfolioStats.total)}
          hint={`${portfolioStats.active} активных кампаний`}
        />
        <KpiCard
          label="Расход 7д"
          value={portfolioStats.spend7d.toLocaleString("ru-RU")}
          tone="accent"
          hint="сумма по портфелю"
        />
        <KpiCard
          label="Конверсии 7д"
          value={String(portfolioStats.conversions7d)}
          tone="secondary"
        />
        <KpiCard
          label="CPL ср. / алерты"
          value={`${
            portfolioStats.avgCpl == null
              ? "—"
              : Math.round(portfolioStats.avgCpl).toLocaleString("ru-RU")
          } · ${portfolioStats.alerts}`}
          tone={portfolioStats.alerts > 0 ? "alert" : "accent"}
          hint="среднее CPL · непрочитанные алерты"
        />
      </KpiGrid>

      <div className="mt-5" />

      {me.role === "owner" ? (
        <Card>
          <ProjectCreateWizard
            name={name}
            setName={setName}
            primaryPlatform={primaryPlatform}
            setPrimaryPlatform={setPrimaryPlatform}
            websiteUrl={websiteUrl}
            setWebsiteUrl={setWebsiteUrl}
            geo={geo}
            setGeo={setGeo}
            budgetDaily={budgetDaily}
            setBudgetDaily={setBudgetDaily}
            usp={usp}
            setUsp={setUsp}
            audience={audience}
            setAudience={setAudience}
            negatives={negatives}
            setNegatives={setNegatives}
            error={error}
            onSubmit={onCreate}
          />
        </Card>
      ) : me.role === "member" ? (
        <Alert tone="info" className="mb-4">
          Вам доступны только проекты, которые назначил владелец агентства.
          На них те же права, что у агентства: семантика, объявления, запуск
          на паузе.
        </Alert>
      ) : (
        <Alert tone="info" className="mb-4">
          Вам доступны только назначенные проекты. Изменения в кабинетах
          делает агентство.
        </Alert>
      )}

      {me.role === "owner" ? (
        <Card>
          <form onSubmit={saveBranding} className="flex flex-col gap-3">
            <CardTitle>White-label</CardTitle>
            <CardHint>
              Название, логотип и цвет кабинета для субклиентов. Ссылка входа:
              {slug.trim()
                ? ` /login?slug=${slug.trim().toLowerCase()}`
                : " задайте slug"}
            </CardHint>
            <input
              className="ui-input"
              placeholder="Название продукта"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <input
              className="ui-input"
              placeholder="slug (acme)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <input
              className="ui-input"
              placeholder="https://… логотип"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              Цвет кнопки
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
              />
              <span className="text-xs text-[var(--fg-muted)]">
                Слишком тёмный цвет на тёмной теме заменяется на лавандовый
                акцент интерфейса
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hideBadge}
                onChange={(e) => setHideBadge(e.target.checked)}
              />
              Скрыть подпись платформы
            </label>
            {inviteHint ? <Alert tone="success">{inviteHint}</Alert> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" className="self-start">
              Сохранить брендинг
            </Button>
          </form>
        </Card>
      ) : null}

      {error && !me.canWrite ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <PortfolioTable
        rows={projects}
        emptyTitle={
          me.role === "owner"
            ? undefined
            : me.role === "member"
              ? "Попросите владельца назначить проекты"
              : "Попросите агентство назначить вам проект"
        }
        emptyHint={
          me.role === "owner"
            ? undefined
            : me.role === "member"
              ? "Владелец агентства назначает контекстолога на вкладке «Бриф» проекта. После этого строка появится здесь."
              : "Попросите агентство пригласить вас в проект. Здесь появятся только назначенные кабинеты."
        }
        onToggleFavorite={async (id, favorite) => {
          setProjects((prev) =>
            prev.map((row) => (row.id === id ? { ...row, favorite } : row)),
          );
          try {
            await api(`/projects/${id}/favorite`, {
              method: "POST",
              body: JSON.stringify({ favorite }),
            });
          } catch (err) {
            setProjects((prev) =>
              prev.map((row) =>
                row.id === id ? { ...row, favorite: !favorite } : row,
              ),
            );
            setError(
              err instanceof Error ? err.message : "Не удалось сохранить избранное",
            );
          }
        }}
      />
    </AppShell>
  );
}
