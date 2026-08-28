export type CreativeElementType =
  | "headline1"
  | "headline2"
  | "description"
  | "sitelink"
  | "callout";

export type PlatformLimit = {
  elementType: CreativeElementType;
  maxLength: number;
  maxCount: number;
};

export type CopyMarketing = {
  usp: string[];
  target_audience: Array<{ segment: string }>;
  forbidden_phrases: string[];
  geo?: string[];
};

export type AdVariant = {
  ab_group: string;
  headline1: string;
  headline2: string;
  description: string;
  sitelinks: string[];
  callouts: string[];
};

export type ClusterCreatives = {
  cluster_name: string;
  ads: AdVariant[];
  ab_variants: number;
};

export function limitOf(
  limits: PlatformLimit[],
  elementType: CreativeElementType,
): PlatformLimit {
  const found = limits.find((item) => item.elementType === elementType);
  if (!found) {
    throw new Error(`Platform limit missing for ${elementType}`);
  }
  return found;
}

export function clipToLimit(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text.trim();
  }
  return text.slice(0, maxLength).trim();
}

export function containsForbidden(
  text: string,
  forbidden: string[],
): string | null {
  const haystack = normalize(text);
  for (const phrase of forbidden) {
    const needle = normalize(phrase);
    if (needle && haystack.includes(needle)) {
      return phrase;
    }
  }
  return null;
}

export function sanitizeForbidden(text: string, forbidden: string[]): string {
  let result = text;
  for (const phrase of forbidden) {
    if (!phrase.trim()) continue;
    result = result.replace(new RegExp(escapeRegExp(phrase), "gi"), "");
  }
  return result.replace(/\s+/g, " ").trim();
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
