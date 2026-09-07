import type { ReactNode } from "react";

export type StatusKind =
  | "draft"
  | "review"
  | "paused"
  | "active"
  | "alert"
  | "success"
  | "danger"
  | "info";

const STYLES: Record<StatusKind, string> = {
  draft: "bg-[var(--status-draft-bg)] text-[var(--status-draft-fg)]",
  review: "bg-[var(--status-review-bg)] text-[var(--status-review-fg)]",
  paused: "bg-[var(--status-paused-bg)] text-[var(--status-paused-fg)]",
  active: "bg-[var(--status-active-bg)] text-[var(--status-active-fg)]",
  alert: "bg-[var(--status-alert-bg)] text-[var(--status-alert-fg)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
};

const PROJECT_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  draft: { kind: "draft", label: "черновик" },
  active: { kind: "active", label: "активен" },
  archived: { kind: "draft", label: "архив" },
  disconnected: { kind: "alert", label: "отключён" },
};

const CAMPAIGN_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  paused: { kind: "paused", label: "пауза" },
  active: { kind: "active", label: "активна" },
  pending_approval: { kind: "review", label: "на проверке" },
  publishing: { kind: "review", label: "публикация" },
  published: { kind: "success", label: "опубликован" },
  failed: { kind: "danger", label: "ошибка" },
  none: { kind: "draft", label: "нет кампании" },
};

export function Badge({
  kind,
  children,
  title,
  className = "",
}: {
  kind: StatusKind;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border border-transparent px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide ${STYLES[kind]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  value,
  map = "project",
}: {
  value: string;
  map?: "project" | "campaign";
}) {
  const dict = map === "campaign" ? CAMPAIGN_STATUS : PROJECT_STATUS;
  const item = dict[value] ?? { kind: "draft" as StatusKind, label: value };
  return <Badge kind={item.kind}>{item.label}</Badge>;
}

export function IssueBadge({
  level,
  autoFixed,
  title,
}: {
  level: "critical" | "warning";
  autoFixed: boolean;
  title?: string;
}) {
  const label = autoFixed
    ? "auto-fix"
    : level === "critical"
      ? "critical"
      : "warning";
  const kind: StatusKind = autoFixed
    ? "info"
    : level === "critical"
      ? "danger"
      : "alert";
  return (
    <Badge kind={kind} title={title}>
      {label}
    </Badge>
  );
}
