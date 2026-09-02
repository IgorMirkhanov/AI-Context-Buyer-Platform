import {
  CampaignDraftStructure,
  CampaignDraftUnit,
  LegacyCampaignDraftStructure,
} from "./types";

export function normalizeCampaignDraft(
  raw: unknown,
): CampaignDraftStructure {
  const value = raw as LegacyCampaignDraftStructure & CampaignDraftStructure;
  if (Array.isArray(value.campaigns) && value.campaigns.length > 0) {
    return {
      campaigns: value.campaigns,
      global_negatives: value.global_negatives ?? [],
    };
  }
  if (value.campaign && Array.isArray(value.ad_groups)) {
    return {
      campaigns: [
        {
          campaign: value.campaign,
          ad_groups: value.ad_groups,
          publish: value.publish,
        },
      ],
      global_negatives: value.global_negatives ?? [],
    };
  }
  throw new Error("Invalid campaign draft structure");
}

export function campaignDraftUnits(
  draft: CampaignDraftStructure | unknown,
): CampaignDraftUnit[] {
  return normalizeCampaignDraft(draft).campaigns;
}
