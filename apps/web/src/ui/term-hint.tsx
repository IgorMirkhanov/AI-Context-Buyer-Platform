"use client";

import type { ReactNode } from "react";
import {
  GLOSSARY,
  useBeginnerMode,
  type GlossaryKey,
} from "@/lib/beginner-mode";

export function TermHint({
  term,
  children,
}: {
  term: GlossaryKey;
  children: ReactNode;
}) {
  const { enabled } = useBeginnerMode();
  const text = GLOSSARY[term];
  if (!enabled) return <>{children}</>;
  return (
    <span className="inline">
      {children}
      <span className="term-hint" tabIndex={0}>
        <span className="term-hint-mark" aria-label={text} title={text}>
          ?
        </span>
        <span className="term-hint-bubble" role="tooltip">
          {text}
        </span>
      </span>
    </span>
  );
}

export function BeginnerNote({
  term,
  className = "",
}: {
  term: GlossaryKey;
  className?: string;
}) {
  const { enabled } = useBeginnerMode();
  if (!enabled) return null;
  return (
    <p className={`text-xs text-[var(--fg-muted)] ${className}`}>
      {GLOSSARY[term]}
    </p>
  );
}
