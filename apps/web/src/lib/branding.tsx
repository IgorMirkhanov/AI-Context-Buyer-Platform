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
  accentColor: "#8083ff",
  supportEmail: null,
  slug: null,
  hidePlatformBadge: false,
};

const STITCH_ACCENT = "#8083ff";
const STITCH_ACCENT_FG = "#0d0096";

function normalizeHex(hex: string): string | null {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (full.length !== 6 || Number.isNaN(Number.parseInt(full, 16))) return null;
  return `#${full.toLowerCase()}`;
}

function luminance(hex: string): number | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const full = normalized.slice(1);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Contrasting label color for primary buttons on org accent. */
export function accentForeground(hex: string): string {
  const lum = luminance(hex);
  if (lum == null) return STITCH_ACCENT_FG;
  return lum > 0.55 ? STITCH_ACCENT_FG : "#f4f4f5";
}

/**
 * Dark shell needs a visible accent. Near-black white-label colors
 * (legacy #18181b) collapse primary CTAs — fall back to Stitch lavender.
 */
export function resolveUiAccent(hex: string | null | undefined): {
  accent: string;
  accentFg: string;
} {
  const candidate = (hex && hex.trim()) || STITCH_ACCENT;
  const lum = luminance(candidate);
  if (lum == null || lum < 0.28) {
    return { accent: STITCH_ACCENT, accentFg: STITCH_ACCENT_FG };
  }
  const accent = normalizeHex(candidate) ?? STITCH_ACCENT;
  return { accent, accentFg: accentForeground(accent) };
}

export function BrandMark({
  branding,
  size = "md",
}: {
  branding: OrgBranding;
  size?: "sm" | "md";
}) {
  const height = size === "sm" ? "h-7" : "h-9";
  return (
    <span className="flex min-w-0 items-center gap-2">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt=""
          className={`${height} w-auto max-w-[160px] object-contain`}
        />
      ) : null}
      <span
        className={`min-w-0 truncate ${
          size === "sm" ? "text-[15px] font-semibold" : "text-lg font-semibold"
        }`}
      >
        {branding.productName}
      </span>
    </span>
  );
}
