export function platformTitle(platform: string): string {
  return platform === "google_ads" ? "Google Ads" : "Яндекс Директ";
}

export function cabinetCampaignUrl(
  platform: string,
  externalCampaignId: string,
): string | null {
  const id = externalCampaignId.trim();
  if (!id) return null;
  if (platform === "google_ads") {
    return `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(id)}`;
  }
  return `https://direct.yandex.ru/dna/campaigns-edit?campaigns-ids=${encodeURIComponent(id)}`;
}
