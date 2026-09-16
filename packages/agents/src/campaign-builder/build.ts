import type { CampaignPlan } from "../campaign-plan/types";
import { sanitizeNegativesAgainstPositives } from "../semantic/heuristics";
import {
  CampaignBuilderInput,
  CampaignDraftStructure,
  CampaignDraftUnit,
  CampaignPlanRef,
} from "./types";
import { validateCampaignDraft } from "./validate";

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

function baseCampaignSettings(
  input: CampaignBuilderInput,
  name: string,
): CampaignDraftUnit["campaign"] {
  const geo = input.geo.length > 0 ? input.geo : ["RU"];
  return {
    name,
    type: "search",
    budget_daily: input.budgetDaily,
    currency: input.currency || "RUB",
    bidding_strategy: "manual_cpc",
    geo,
    schedule: { days: ["mon-fri"], hours: "08:00-22:00" },
    href: input.websiteUrl.trim(),
    initial_status: "paused",
  };
}

function clusterToAdGroup(
  cluster: CampaignBuilderInput["clusters"][number],
  href: string,
  groupName?: string,
): CampaignDraftUnit["ad_groups"][number] {
  if (cluster.keywords.length === 0) {
    throw new Error(`Cluster "${cluster.name}" has no keywords`);
  }
  if (cluster.ads.length === 0) {
    throw new Error(`Cluster "${cluster.name}" has no ads`);
  }
  return {
    name: groupName ?? cluster.name,
    cluster_name: cluster.name,
    keywords: unique(cluster.keywords),
    negative_keywords: unique(cluster.negative_keywords),
    ads: cluster.ads.map((ad) => ({ ...ad, href })),
  };
}

function buildAdGroupFromClusters(
  group: CampaignPlanRef["campaigns"][number]["ad_groups"][number],
  clustersByName: Map<string, CampaignBuilderInput["clusters"][number]>,
  href: string,
): CampaignDraftUnit["ad_groups"][number] {
  const matched = group.cluster_names.map((name) => {
    const cluster = clustersByName.get(name);
    if (!cluster) {
      throw new Error(`Cluster "${name}" from plan is missing in semantic core`);
    }
    return cluster;
  });
  if (matched.length === 1) {
    return clusterToAdGroup(matched[0], href, group.name);
  }
  const keywords = unique(matched.flatMap((item) => item.keywords)).slice(
    0,
    12,
  );
  const negative_keywords = unique(
    matched.flatMap((item) => item.negative_keywords),
  ).slice(0, 40);
  const ads = matched.flatMap((item) => item.ads);
  if (keywords.length === 0 || ads.length === 0) {
    throw new Error(`Ad group "${group.name}" has no keywords or ads`);
  }
  return {
    name: group.name,
    cluster_name: matched.map((item) => item.name).join(" + "),
    keywords,
    negative_keywords,
    ads: ads.map((ad) => ({ ...ad, href })),
  };
}

export function buildCampaignDraft(
  input: CampaignBuilderInput,
  plan?: CampaignPlan | CampaignPlanRef,
): CampaignDraftStructure {
  if (!input.websiteUrl.trim()) {
    throw new Error("website_url is required to build a campaign draft");
  }
  if (input.clusters.length === 0) {
    throw new Error("semantic clusters are required");
  }
  const href = input.websiteUrl.trim();
  const clustersByName = new Map(
    input.clusters.map((cluster) => [cluster.name, cluster]),
  );

  let campaigns: CampaignDraftUnit[];
  if (plan && plan.campaigns.length > 0) {
    campaigns = plan.campaigns.map((planned) => ({
      campaign: baseCampaignSettings(input, planned.name),
      ad_groups: planned.ad_groups.map((group) =>
        buildAdGroupFromClusters(group, clustersByName, href),
      ),
      publish: { step: "idle" },
    }));
  } else {
    campaigns = [
      {
        campaign: baseCampaignSettings(
          input,
          `${input.projectName} — Search — ${input.geo[0] ?? "RU"}`,
        ),
        ad_groups: input.clusters.map((cluster) =>
          clusterToAdGroup(cluster, href),
        ),
        publish: { step: "idle" },
      },
    ];
  }

  const draft: CampaignDraftStructure = {
    campaigns,
    global_negatives: unique(input.global_negatives),
  };
  const allPositives = draft.campaigns.flatMap((unit) =>
    unit.ad_groups.flatMap((group) => group.keywords),
  );
  draft.global_negatives = sanitizeNegativesAgainstPositives(
    draft.global_negatives,
    allPositives,
  );
  for (const unit of draft.campaigns) {
    for (const group of unit.ad_groups) {
      group.negative_keywords = sanitizeNegativesAgainstPositives(
        unique([...group.negative_keywords, ...draft.global_negatives]),
        group.keywords,
      );
    }
  }
  validateCampaignDraft(draft);
  return draft;
}
