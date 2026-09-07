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
      className={`ui-panel relative mb-4 p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-base font-semibold tracking-tight text-[var(--fg)]">
      {children}
    </h2>
  );
}

export function CardHint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm text-[var(--fg-muted)]">{children}</p>;
}
