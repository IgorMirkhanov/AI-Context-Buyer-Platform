export type LiveCampaignRow = {
  id: string;
  externalCampaignId: string;
  status: string;
  source?: "platform" | "external";
  name?: string | null;
  draftUnitIndex?: number | null;
};

export type DraftCampaignUnit = {
  campaign: { name: string };
  publish?: { externalCampaignId?: string; step?: string };
};

export type CampaignRef = {
  internalName: string;
  externalCampaignId: string | null;
  status: string | null;
  source: "platform" | "external" | "planned";
  published: boolean;
};

export function buildCampaignRefs(input: {
  draftUnits?: DraftCampaignUnit[] | null;
  liveCampaigns?: LiveCampaignRow[] | null;
  plannedNames?: string[] | null;
}): CampaignRef[] {
  const draftUnits = input.draftUnits ?? [];
  const live = input.liveCampaigns ?? [];
  const platformLive = live.filter((item) => item.source !== "external");

  if (draftUnits.length > 0) {
    return draftUnits.map((unit, index) => {
      const fromPublish = unit.publish?.externalCampaignId?.trim() || null;
      const matched =
        platformLive.find((item) => item.draftUnitIndex === index) ??
        (fromPublish
          ? platformLive.find((item) => item.externalCampaignId === fromPublish)
          : undefined);
      const externalCampaignId =
        matched?.externalCampaignId ?? fromPublish ?? null;
      return {
        internalName: unit.campaign.name,
        externalCampaignId,
        status: matched?.status ?? null,
        source: "platform" as const,
        published: Boolean(externalCampaignId),
      };
    });
  }

  if (platformLive.length > 0) {
    return platformLive.map((item) => ({
      internalName: item.name?.trim() || `Кампания ${item.externalCampaignId}`,
      externalCampaignId: item.externalCampaignId,
      status: item.status,
      source: item.source === "external" ? "external" : "platform",
      published: true,
    }));
  }

  const planned = (input.plannedNames ?? []).filter(Boolean);
  return planned.map((name) => ({
    internalName: name,
    externalCampaignId: null,
    status: null,
    source: "planned" as const,
    published: false,
  }));
}

export function resolveAnalyzedWebsiteUrl(input: {
  briefWebsiteUrl?: string | null;
  analysisWebsiteUrl?: string | null;
  projectWebsiteUrl?: string | null;
}): string | null {
  return (
    input.analysisWebsiteUrl?.trim() ||
    input.briefWebsiteUrl?.trim() ||
    input.projectWebsiteUrl?.trim() ||
    null
  );
}
