import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-base font-semibold tracking-tight">{children}</h2>;
}

export function CardHint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-[var(--fg-muted)]">{children}</p>;
}
