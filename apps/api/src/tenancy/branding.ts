export const DEFAULT_PRODUCT_NAME = "AI Context-Buyer Platform";
export const DEFAULT_ACCENT = "#18181b";

export type OrgBranding = {
  productName: string;
  logoUrl: string | null;
  accentColor: string;
  supportEmail: string | null;
  slug: string | null;
  hidePlatformBadge: boolean;
};

export type BrandingInput = {
  productName?: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  supportEmail?: string | null;
  slug?: string | null;
  hidePlatformBadge?: boolean;
};

export function resolveBranding(
  org: {
    name: string;
    slug?: string | null;
    brandingJson?: unknown;
  } | null,
): OrgBranding {
  const raw = asRecord(org?.brandingJson);
  return {
    productName:
      sanitizeProductName(asString(raw?.productName)) ||
      org?.name ||
      DEFAULT_PRODUCT_NAME,
    logoUrl: sanitizeHttpsUrl(asString(raw?.logoUrl)),
    accentColor: sanitizeHex(asString(raw?.accentColor)) || DEFAULT_ACCENT,
    supportEmail: sanitizeEmail(asString(raw?.supportEmail)),
    slug: org?.slug ?? sanitizeSlug(asString(raw?.slug)),
    hidePlatformBadge: raw?.hidePlatformBadge === true,
  };
}

export function brandingToJson(input: BrandingInput): Record<string, unknown> {
  return {
    productName: sanitizeProductName(input.productName) || DEFAULT_PRODUCT_NAME,
    logoUrl: sanitizeHttpsUrl(input.logoUrl),
    accentColor: sanitizeHex(input.accentColor) || DEFAULT_ACCENT,
    supportEmail: sanitizeEmail(input.supportEmail),
    hidePlatformBadge: input.hidePlatformBadge === true,
  };
}

export function sanitizeSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
    return null;
  }
  return slug;
}

export function sanitizeHttpsUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    const href = url.toString();
    return href.length <= 500 ? href : null;
  } catch {
    return null;
  }
}

export function sanitizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const hex = value.trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(hex)) return null;
  return hex.toLowerCase();
}

export function sanitizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return null;
  }
  return email;
}

export function sanitizeProductName(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
