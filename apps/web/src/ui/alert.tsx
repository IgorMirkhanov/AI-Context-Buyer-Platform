import type { ReactNode } from "react";

type Tone = "alert" | "success" | "danger" | "info";

const TONE: Record<Tone, string> = {
  alert:
    "border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] text-[var(--status-alert-fg)]",
  success:
    "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  danger:
    "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  info: "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
};

export function Alert({
  tone = "alert",
  title,
  children,
  className = "",
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`rounded-[var(--radius)] border px-3 py-3 text-sm ${TONE[tone]} ${className}`}
    >
      {title ? <p className="mb-1 font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
