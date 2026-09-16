"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { BrandMark, resolveUiAccent, type OrgBranding } from "@/lib/branding";
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

function navClass(active: boolean): string {
  return active
    ? "rounded px-2 py-1.5 text-sm border-l-2 border-[var(--accent)] bg-[var(--bg-high)] font-medium text-[var(--fg)]"
    : "rounded px-2 py-1.5 text-sm border-l-2 border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-mid)] hover:text-[var(--fg)]";
}

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
  const { accent, accentFg } = resolveUiAccent(branding.accentColor);
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
        className="flex min-h-screen bg-[var(--bg)] text-[var(--fg)]"
        style={
          {
            ["--accent" as string]: accent,
            ["--accent-fg" as string]: accentFg,
          } as CSSProperties
        }
      >
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-3">
          <Link href="/projects" className="mb-4 flex items-center gap-2 px-2 py-1">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] text-[11px] font-semibold text-[var(--accent-soft)]"
              aria-hidden
            >
              CB
            </span>
            <BrandMark branding={branding} size="sm" />
          </Link>
          {orgName && orgName !== branding.productName ? (
            <p className="mb-2 truncate px-2 font-mono text-[11px] text-[var(--outline)]">
              {orgName}
            </p>
          ) : null}

          <nav className="mb-4 flex flex-col gap-0.5" aria-label="Разделы кабинета">
            <Link href="/projects" className={navClass(current === "projects")}>
              Портфель проектов
            </Link>
            {canManageOrg ? (
              <Link
                href="/settings/ai"
                className={navClass(current === "settings")}
              >
                Настройки · ИИ
              </Link>
            ) : null}
          </nav>

          {project ? (
            <nav
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto border-t border-[var(--border)] pt-3"
              aria-label="Разделы проекта"
            >
              <p className="mb-2 truncate px-2 text-[11px] font-medium uppercase tracking-wide text-[var(--outline)]">
                {project.name}
              </p>
              {PROJECT_TABS.map((item) => (
                <Link
                  key={item.id}
                  href={`/projects/${project.id}?tab=${item.id}`}
                  className={navClass(tab === item.id)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : (
            <div className="flex-1" />
          )}

          <div className="mt-auto space-y-2 border-t border-[var(--border)] pt-3">
            {onBeginnerModeChange ? (
              <label className="flex cursor-pointer items-start gap-2 px-2 text-xs text-[var(--fg)]">
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-0.5 accent-[var(--accent)]"
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
              <p className="truncate px-2 font-mono text-[11px] text-[var(--outline)]">
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
            {!canWrite ? (
              <p className="px-2 font-mono text-[10px] text-[var(--outline)]">
                только чтение
              </p>
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {project ? (
            <header className="sticky top-0 z-20 flex h-12 flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-surface)]/95 px-4 backdrop-blur">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                <Link
                  href="/projects"
                  className="shrink-0 text-[var(--outline)] hover:text-[var(--fg)]"
                >
                  Портфель
                </Link>
                <span className="text-[var(--border-strong)]">/</span>
                <span className="truncate text-[var(--outline)]">{project.name}</span>
                {tab ? (
                  <>
                    <span className="text-[var(--border-strong)]">/</span>
                    <span className="font-medium text-[var(--fg)]">
                      {PROJECT_TABS.find((item) => item.id === tab)?.label ?? tab}
                    </span>
                  </>
                ) : null}
                <StatusBadge value={project.status} />
                {subtitle ? (
                  <span className="inline-flex max-w-full flex-wrap items-center gap-2 text-[var(--fg-muted)]">
                    {subtitle}
                  </span>
                ) : null}
              </div>
            </header>
          ) : null}
          <main
            className={`mx-auto w-full flex-1 px-4 py-4 ${
              wide ? "max-w-[88rem]" : "max-w-5xl"
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </BeginnerModeProvider>
  );
}
