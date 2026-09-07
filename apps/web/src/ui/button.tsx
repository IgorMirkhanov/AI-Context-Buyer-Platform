import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-transparent bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_45%,transparent)] hover:brightness-110 disabled:opacity-50",
  secondary:
    "border border-[var(--border)] bg-[var(--bg-mid)] text-[var(--fg)] hover:bg-[var(--bg-high)] disabled:opacity-50",
  ghost:
    "text-[var(--fg-muted)] hover:bg-[var(--bg-mid)] hover:text-[var(--fg)] disabled:opacity-50",
  danger:
    "border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] hover:opacity-90 disabled:opacity-50",
};

export function btnClass(
  variant: Variant = "primary",
  extra = "",
): string {
  return `inline-flex items-center justify-center rounded-[8px] px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${extra}`;
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
