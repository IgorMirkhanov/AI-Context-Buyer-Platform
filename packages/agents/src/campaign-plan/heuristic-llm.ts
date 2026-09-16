import { estimateLlmCostUsd } from "../llm/cost";
import type { LlmUsage } from "../semantic/types";
import type {
  CampaignPlan,
  CampaignPlanBriefInput,
  CampaignPlanClusterInput,
  CampaignPlanWriter,
} from "./types";
import { validateCampaignPlan } from "./validate";

function usage(step: string, prompt: string, response: string): LlmUsage {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(response.length / 4);
  return {
    model: "heuristic",
    prompt,
    response,
    inputTokens,
    outputTokens,
    costUsd: estimateLlmCostUsd("heuristic", inputTokens, outputTokens),
    latencyMs: 0,
    step,
  };
}

export class HeuristicCampaignPlanWriter implements CampaignPlanWriter {
  async plan(
    brief: CampaignPlanBriefInput,
    clusters: CampaignPlanClusterInput[],
  ): Promise<{ plan: CampaignPlan; usage: LlmUsage }> {
    const brandAll = clusters.filter((item) => item.category === "brand");
    const geoAll = clusters.filter((item) => item.category === "geo");
    const restAll = clusters.filter(
      (item) => item.category !== "brand" && item.category !== "geo",
    );

    // Keep only brand clusters that mention the project / product name —
    // otherwise Planner SKUs («креатив s8») pollute the brand campaign.
    const brandKeep = brandAll.filter((cluster) =>
      clusterLooksBranded(cluster, brief.project_name),
    );
    const brandSpill = brandAll.filter(
      (cluster) => !clusterLooksBranded(cluster, brief.project_name),
    );

    const brand = packClusters(brandKeep, 4);
    const geo = packClusters(geoAll, 4);
    const rest = packClusters([...restAll, ...brandSpill], 12);
    const campaigns: CampaignPlan["campaigns"] = [];

    if (brand.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Бренд`,
        rationale:
          "Брендовые кластеры выделены отдельно, чтобы контролировать ставки и не смешивать с общими запросами.",
        ad_groups: brand,
      });
    }
    if (geo.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Гео`,
        rationale:
          "Гео-кластеры в отдельной кампании для точного таргетинга по регионам.",
        ad_groups: geo,
      });
    }
    if (rest.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Поиск`,
        rationale:
          "До 12 поисковых групп: мелкие кластеры сливаются, чтобы не публиковать сотни микро-групп.",
        ad_groups: rest,
      });
    }
    if (campaigns.length === 0) {
      campaigns.push({
        name: `${brief.project_name} — Search`,
        rationale: "Единая кампания по всем кластерам семантики.",
        ad_groups: packClusters(clusters, 12),
      });
    }

    const plan = { campaigns };
    validateCampaignPlan(plan, clusters);
    const response = JSON.stringify(plan);
    return {
      plan,
      usage: usage("plan_campaigns", JSON.stringify({ brief, clusters }), response),
    };
  }
}

/** Pack many clusters into ≤limit ad groups (round-robin merge of leftovers). */
function packClusters(
  clusters: CampaignPlanClusterInput[],
  limit: number,
): Array<{ name: string; cluster_names: string[] }> {
  if (clusters.length === 0) return [];
  const ranked = [...clusters].sort((a, b) => {
    const byCount = (b.keyword_count ?? 0) - (a.keyword_count ?? 0);
    if (byCount !== 0) return byCount;
    return a.name.localeCompare(b.name, "ru");
  });
  const heads = ranked.slice(0, limit);
  const overflow = ranked.slice(limit);
  return heads.map((cluster, index) => ({
    name: cluster.name,
    cluster_names: [
      cluster.name,
      ...overflow
        .filter((_, i) => i % heads.length === index)
        .map((item) => item.name),
    ],
  }));
}

function clusterLooksBranded(
  cluster: CampaignPlanClusterInput,
  projectName: string,
): boolean {
  const brandTokens = projectName
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .map((t) => t.replace(/[^a-zа-яё0-9]/giu, ""))
    .filter((t) => t.length >= 4);
  if (brandTokens.length === 0) return true;
  const hay = `${cluster.name} ${cluster.sample_keywords.join(" ")}`.toLowerCase();
  return brandTokens.some((token) => hay.includes(token));
}
