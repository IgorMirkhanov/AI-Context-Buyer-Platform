import type { ReactNode } from "react";
import { Sparkline } from "./charts";

export function KpiCard({
  label,
  value,
  hint,
  spark,
  tone = "accent",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  spark?: number[];
  tone?: "accent" | "secondary" | "alert" | "danger";
  className?: string;
}) {
  return (
    <div className={`ui-kpi flex flex-col gap-2 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug text-[var(--outline)]">{label}</p>
        {spark && spark.length > 1 ? (
          <Sparkline values={spark} tone={tone} className="h-7 w-16 shrink-0" />
        ) : null}
      </div>
      <p className="font-mono text-2xl font-semibold tracking-tight text-[var(--fg)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-auto border-t border-[var(--border)] pt-2 font-mono text-[11px] text-[var(--fg-faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function KpiGrid({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 5;
}) {
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : cols === 5
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          : "sm:grid-cols-2 xl:grid-cols-4";
  return <div className={`grid grid-cols-1 gap-3 ${colClass}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                : "text-[var(--fg-muted)] hover:bg-[var(--bg-mid)] hover:text-[var(--fg)]"
            }`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "off" | "busy";
  label: string;
}) {
  const color =
    tone === "ok"
      ? "bg-[var(--secondary)]"
      : tone === "warn"
        ? "bg-[var(--status-alert-fg)]"
        : tone === "busy"
          ? "bg-[var(--accent-soft)]"
          : "bg-[var(--fg-faint)]";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--outline)]">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
