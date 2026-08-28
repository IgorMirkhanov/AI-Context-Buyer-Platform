/** ISO-ish brief geo → Yandex Direct region IDs (Dictionaries.GeoRegions). */
export const YANDEX_GEO_REGION_IDS: Record<string, number> = {
  RU: 225,
  "RU-MOW": 213,
  "RU-SPE": 2,
  KZ: 159,
  "KZ-ALA": 163,
  BY: 149,
  UA: 187,
};

export function yandexRegionIds(geo: string[]): number[] {
  const ids = geo
    .map((code) => YANDEX_GEO_REGION_IDS[code] ?? YANDEX_GEO_REGION_IDS[code.split("-")[0] ?? ""])
    .filter((id): id is number => typeof id === "number");
  return ids.length > 0 ? [...new Set(ids)] : [225];
}

/** Direct money: 1 currency unit = 1_000_000 API units. */
export function toYandexMoney(amount: number): number {
  return Math.round(amount * 1_000_000);
}
