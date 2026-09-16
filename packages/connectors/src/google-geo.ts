/**
 * Brief geo codes → Google Ads geoTargetConstant criterion IDs.
 * @see https://developers.google.com/google-ads/api/data/geotargets
 * City IDs verified against geotargets CSV / JSON SEO directory (2024+).
 */
export const GOOGLE_GEO_TARGET_IDS: Record<string, number> = {
  RU: 2643,
  /** Moscow (city) — not oblast/legacy 1024443 */
  "RU-MOW": 1011969,
  /** Saint Petersburg (city) */
  "RU-SPE": 1012040,
  /** Alias used in some briefs */
  "RU-SPB": 1012040,
  KZ: 2398,
  /** Almaty (city) — city OK for campaign targeting; Keyword Planner uses country */
  "KZ-ALA": 1028243,
  BY: 2112,
  UA: 2804,
};

/** Russian (ru) language constant — default for CIS briefs. */
export const GOOGLE_LANGUAGE_RU = "languageConstants/1031";
export const GOOGLE_LANGUAGE_EN = "languageConstants/1000";

export function googleGeoTargetConstants(geo: string[]): string[] {
  const ids = geo
    .map((raw) => {
      const code = raw.trim().toUpperCase();
      return (
        GOOGLE_GEO_TARGET_IDS[code] ??
        GOOGLE_GEO_TARGET_IDS[code.split("-")[0] ?? ""]
      );
    })
    .filter((id): id is number => typeof id === "number");
  const unique = [...new Set(ids.length > 0 ? ids : [2643])];
  return unique.map((id) => `geoTargetConstants/${id}`);
}

/**
 * Keyword Planner (`generateKeywordIdeas`) often returns
 * `keywordPlanIdeaError=INVALID_VALUE` for city-level geo constants that still
 * work as campaign location targets. Use country-level IDs for idea generation.
 */
export function googleGeoTargetConstantsForKeywordIdeas(
  geo: string[],
): string[] {
  const ids = geo
    .map((raw) => {
      const code = raw.trim().toUpperCase();
      const country = code.split("-")[0] ?? code;
      return GOOGLE_GEO_TARGET_IDS[country] ?? GOOGLE_GEO_TARGET_IDS[code];
    })
    .filter((id): id is number => typeof id === "number");
  const unique = [...new Set(ids.length > 0 ? ids : [2643])];
  return unique.map((id) => `geoTargetConstants/${id}`);
}

export function googleLanguageForGeo(geo: string[]): string {
  const codes = geo.map((c) => c.trim().toUpperCase());
  if (
    codes.some(
      (c) =>
        c === "RU" ||
        c.startsWith("RU-") ||
        c === "KZ" ||
        c.startsWith("KZ-") ||
        c === "BY" ||
        c === "UA",
    )
  ) {
    return GOOGLE_LANGUAGE_RU;
  }
  return GOOGLE_LANGUAGE_EN;
}
