import type { ReactNode } from "react";
import { BrandMark, DEFAULT_BRANDING, type OrgBranding } from "@/lib/branding";

export function GuestShell({
  branding = DEFAULT_BRANDING,
  children,
}: {
  branding?: OrgBranding;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-8 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
        <div className="mb-6">
          <BrandMark branding={branding} />
        </div>
        {children}
      </div>
      {branding.hidePlatformBadge ? null : (
        <p className="mt-4 text-center text-xs text-[var(--fg-muted)]">
          {DEFAULT_BRANDING.productName}
        </p>
      )}
    </main>
  );
}
