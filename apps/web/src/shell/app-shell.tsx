"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BrandMark, type OrgBranding } from "@/lib/branding";
import { api, clearToken } from "@/lib/api";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/badge";
import { BeginnerModeProvider } from "@/lib/beginner-mode";
import { PROJECT_TABS, type ProjectTabId } from "./project-tabs";

export type ShellProject = {
  id: string;
  name: string;
  status: string;
};

export function AppShell({
  branding,
  orgName,
  email,
  canWrite,
  canManageOrg = false,
  project,
  tab,
  current = project ? "project" : "projects",
  subtitle,
  wide = false,
  beginnerMode = false,
  onBeginnerModeChange,
  onLogout,
  children,
}: {
  branding: OrgBranding;
  orgName?: string;
  email?: string;
  canWrite?: boolean;
  canManageOrg?: boolean;
  project?: ShellProject | null;
  tab?: ProjectTabId;
  current?: "projects" | "settings" | "project";
  subtitle?: ReactNode;
  wide?: boolean;
  beginnerMode?: boolean;
  onBeginnerModeChange?: (value: boolean) => void;
  onLogout?: () => void;
  children: ReactNode;
}) {
  const accent = branding.accentColor || "#18181b";
  const [pendingHint, setPendingHint] = useState(false);

  async function toggleBeginner(next: boolean) {
    onBeginnerModeChange?.(next);
    setPendingHint(true);
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ beginnerMode: next }),
      });
    } catch {
      onBeginnerModeChange?.(!next);
    } finally {
      setPendingHint(false);
    }
  }
  return (
    <BeginnerModeProvider enabled={beginnerMode} onChange={onBeginnerModeChange}>
    <div
      className="flex min-h-screen"
      style={{ ["--accent" as string]: accent }}
    >
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-4">
        <Link href="/projects" className="px-2">
          <BrandMark branding={branding} size="sm" />
        </Link>
        {orgName && orgName !== branding.productName ? (
          <p className="mt-1 truncate px-2 text-xs text-[var(--fg-muted)]">
            {orgName}
          </p>
        ) : null}

        <nav className="mt-6 flex flex-col gap-1" aria-label="Разделы кабинета">
          <Link
            href="/projects"
            className={`rounded-lg px-2 py-1.5 text-sm ${
              current === "projects"
                ? "bg-zinc-100 font-medium text-[var(--fg)]"
                : "text-[var(--fg-muted)] hover:bg-zinc-50 hover:text-[var(--fg)]"
            }`}
          >
            Портфель проектов
          </Link>
          {canManageOrg ? (
            <Link
              href="/settings/ai"
              className={`rounded-lg px-2 py-1.5 text-sm ${
                current === "settings"
                  ? "bg-zinc-100 font-medium text-[var(--fg)]"
                  : "text-[var(--fg-muted)] hover:bg-zinc-50 hover:text-[var(--fg)]"
              }`}
            >
              Настройки · ИИ
            </Link>
          ) : null}
        </nav>

        {project ? (
          <nav
            className="mt-6 flex flex-col gap-0.5 border-t border-[var(--border)] pt-4"
            aria-label="Разделы проекта"
          >
            <p className="mb-2 truncate px-2 text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">
              {project.name}
            </p>
            {PROJECT_TABS.map((item) => (
              <Link
                key={item.id}
                href={`/projects/${project.id}?tab=${item.id}`}
                className={`rounded-lg px-2 py-1.5 text-sm ${
                  tab === item.id
                    ? "bg-zinc-100 font-medium text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:bg-zinc-50 hover:text-[var(--fg)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="mt-auto border-t border-[var(--border)] pt-3">
          {onBeginnerModeChange ? (
            <label className="mb-3 flex cursor-pointer items-start gap-2 px-2 text-xs text-[var(--fg)]">
              <input
                type="checkbox"
                role="switch"
                className="mt-0.5"
                checked={beginnerMode}
                disabled={pendingHint}
                onChange={(event) => void toggleBeginner(event.target.checked)}
              />
              <span>
                <span className="font-medium">Режим новичка</span>
                <span className="mt-0.5 block text-[var(--fg-muted)]">
                  Подсказки к терминам. Экспертные кнопки не скрываются.
                </span>
              </span>
            </label>
          ) : null}
          {email ? (
            <p className="mb-2 truncate px-2 text-xs text-[var(--fg-muted)]">
              {email}
            </p>
          ) : null}
          {onLogout ? (
            <Button
              variant="ghost"
              className="w-full justify-start px-2 text-sm"
              type="button"
              onClick={() => {
                clearToken();
                onLogout();
              }}
            >
              Выйти
            </Button>
          ) : null}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {project ? (
          <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-3">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            <StatusBadge value={project.status} />
            {subtitle ? (
              <p className="text-sm text-[var(--fg-muted)]">{subtitle}</p>
            ) : null}
          </header>
        ) : null}
        <main
          className={`mx-auto px-6 py-6 ${wide ? "max-w-[1100px]" : "max-w-4xl"}`}
        >
          {children}
        </main>
      </div>
    </div>
    </BeginnerModeProvider>
  );
}
