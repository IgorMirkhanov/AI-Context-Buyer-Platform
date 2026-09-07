import type { ReactNode } from "react";
import { Button } from "./button";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--bg-high)] ${className}`}
      aria-hidden
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg)] px-4 py-6 text-sm">
      <p className="font-medium text-[var(--fg)]">{title}</p>
      <p className="mt-1 text-[var(--fg-muted)]">{children}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--status-danger-fg)]">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="mt-1">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-3" type="button" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
