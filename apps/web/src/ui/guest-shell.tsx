import type { CSSProperties, ReactNode } from "react";
import {
  BrandMark,
  DEFAULT_BRANDING,
  resolveUiAccent,
  type OrgBranding,
} from "@/lib/branding";

export function GuestShell({
  branding = DEFAULT_BRANDING,
  children,
}: {
  branding?: OrgBranding;
  children: ReactNode;
}) {
  const { accent, accentFg } = resolveUiAccent(branding.accentColor);

  return (
    <main
      className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center p-6"
      style={
        {
          ["--accent" as string]: accent,
          ["--accent-fg" as string]: accentFg,
        } as CSSProperties
      }
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent), var(--bg)",
        }}
        aria-hidden
      />
      <div className="ui-panel relative p-8">
        <div className="mb-6">
          <BrandMark branding={branding} />
        </div>
        {children}
      </div>
      {branding.hidePlatformBadge ? null : (
        <p className="mt-4 text-center font-mono text-[11px] text-[var(--outline)]">
          {DEFAULT_BRANDING.productName} · без автопубликации
        </p>
      )}
    </main>
  );
}
