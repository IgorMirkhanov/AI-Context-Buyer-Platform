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
    const brand = clusters.filter((item) => item.category === "brand");
    const geo = clusters.filter((item) => item.category === "geo");
    const rest = clusters.filter(
      (item) => item.category !== "brand" && item.category !== "geo",
    );
    const campaigns: CampaignPlan["campaigns"] = [];

    if (brand.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Бренд`,
        rationale:
          "Брендовые кластеры выделены отдельно, чтобы контролировать ставки и не смешивать с общими запросами.",
        ad_groups: brand.map((cluster) => ({
          name: cluster.name,
          cluster_names: [cluster.name],
        })),
      });
    }
    if (geo.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Гео`,
        rationale:
          "Гео-кластеры в отдельной кампании для точного таргетинга по регионам.",
        ad_groups: geo.map((cluster) => ({
          name: cluster.name,
          cluster_names: [cluster.name],
        })),
      });
    }
    if (rest.length > 0) {
      campaigns.push({
        name: `${brief.project_name} — Поиск`,
        rationale:
          "Остальные кластеры объединены в поисковую кампанию по коммерческому интенту.",
        ad_groups: rest.map((cluster) => ({
          name: cluster.name,
          cluster_names: [cluster.name],
        })),
      });
    }
    if (campaigns.length === 0) {
      campaigns.push({
        name: `${brief.project_name} — Search`,
        rationale: "Единая кампания по всем кластерам семантики.",
        ad_groups: clusters.map((cluster) => ({
          name: cluster.name,
          cluster_names: [cluster.name],
        })),
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
