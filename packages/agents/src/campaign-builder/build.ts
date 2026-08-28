import { CampaignBuilderInput, CampaignDraftStructure } from "./types";
import { validateCampaignDraft } from "./validate";

export function buildCampaignDraft(
  input: CampaignBuilderInput,
): CampaignDraftStructure {
  if (!input.websiteUrl.trim()) {
    throw new Error("website_url is required to build a campaign draft");
  }
  if (input.clusters.length === 0) {
    throw new Error("semantic clusters are required");
  }
  const geo = input.geo.length > 0 ? input.geo : ["RU"];
  const href = input.websiteUrl.trim();
  const draft: CampaignDraftStructure = {
    campaign: {
      name: `${input.projectName} — Search — ${geo[0]}`,
      type: "search",
      budget_daily: input.budgetDaily,
      currency: input.currency || "RUB",
      bidding_strategy: "manual_cpc",
      geo,
      schedule: { days: ["mon-fri"], hours: "08:00-22:00" },
      href,
      initial_status: "paused",
    },
    ad_groups: input.clusters.map((cluster) => {
      if (cluster.keywords.length === 0) {
        throw new Error(`Cluster "${cluster.name}" has no keywords`);
      }
      if (cluster.ads.length === 0) {
        throw new Error(`Cluster "${cluster.name}" has no ads`);
      }
      return {
        name: cluster.name,
        cluster_name: cluster.name,
        keywords: unique(cluster.keywords),
        negative_keywords: unique([
          ...cluster.negative_keywords,
          ...input.global_negatives,
        ]),
        ads: cluster.ads.map((ad) => ({
          ...ad,
          href,
        })),
      };
    }),
    global_negatives: unique(input.global_negatives),
    publish: { step: "idle" },
  };
  validateCampaignDraft(draft);
  return draft;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item.trim());
  }
  return result;
}
