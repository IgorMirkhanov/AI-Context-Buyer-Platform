import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--fg)] hover:bg-zinc-50 disabled:opacity-50",
  ghost: "text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50",
  danger:
    "border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] disabled:opacity-50",
};

export function btnClass(
  variant: Variant = "primary",
  extra = "",
): string {
  return `inline-flex items-center justify-center rounded-[8px] px-4 py-2 text-sm font-medium transition-opacity ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button className={btnClass(variant, className)} {...props}>
      {children}
    </button>
  );
}
