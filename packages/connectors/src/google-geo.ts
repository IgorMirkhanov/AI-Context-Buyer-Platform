/**
 * Brief geo codes → Google Ads geoTargetConstant criterion IDs.
 * @see https://developers.google.com/google-ads/api/data/geotargets
 */
export const GOOGLE_GEO_TARGET_IDS: Record<string, number> = {
  RU: 2643,
  "RU-MOW": 1024443,
  "RU-SPE": 1011971,
  KZ: 2398,
  BY: 2112,
  UA: 2804,
};

/** Russian (ru) language constant — default for CIS briefs. */
export const GOOGLE_LANGUAGE_RU = "languageConstants/1031";
export const GOOGLE_LANGUAGE_EN = "languageConstants/1000";

export function googleGeoTargetConstants(geo: string[]): string[] {
  const ids = geo
    .map(
      (code) =>
        GOOGLE_GEO_TARGET_IDS[code] ??
        GOOGLE_GEO_TARGET_IDS[code.split("-")[0] ?? ""],
    )
    .filter((id): id is number => typeof id === "number");
  const unique = [...new Set(ids.length > 0 ? ids : [2643])];
  return unique.map((id) => `geoTargetConstants/${id}`);
}

export function googleLanguageForGeo(geo: string[]): string {
  const codes = geo.map((c) => c.toUpperCase());
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
