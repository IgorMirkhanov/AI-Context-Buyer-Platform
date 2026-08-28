"use client";

export type OrgBranding = {
  productName: string;
  logoUrl: string | null;
  accentColor: string;
  supportEmail: string | null;
  slug: string | null;
  hidePlatformBadge: boolean;
};

export const DEFAULT_BRANDING: OrgBranding = {
  productName: "AI Context-Buyer Platform",
  logoUrl: null,
  accentColor: "#18181b",
  supportEmail: null,
  slug: null,
  hidePlatformBadge: false,
};

export function BrandMark({
  branding,
  size = "md",
}: {
  branding: OrgBranding;
  size?: "sm" | "md";
}) {
  const height = size === "sm" ? "h-7" : "h-9";
  return (
    <span className="flex items-center gap-2">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt=""
          className={`${height} w-auto max-w-[160px] object-contain`}
        />
      ) : null}
      <span className={size === "sm" ? "text-sm font-medium" : "font-semibold"}>
        {branding.productName}
      </span>
    </span>
  );
}
