import type {
  CampaignPlan,
  CampaignPlanClusterInput,
} from "./types";

export class CampaignPlanValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`campaign_plan invalid: ${details.join("; ")}`);
    this.name = "CampaignPlanValidationError";
  }
}

export function validateCampaignPlan(
  plan: CampaignPlan,
  clusters: CampaignPlanClusterInput[],
): void {
  const errors: string[] = [];
  const clusterNames = new Set(clusters.map((item) => item.name));
  if (!plan.campaigns || plan.campaigns.length === 0) {
    errors.push("campaigns must not be empty");
  }
  const assigned = new Set<string>();
  for (const [index, campaign] of (plan.campaigns ?? []).entries()) {
    if (!campaign.name?.trim()) {
      errors.push(`campaigns[${index}].name is required`);
    }
    if (!campaign.rationale?.trim()) {
      errors.push(`campaigns[${index}].rationale is required`);
    }
    if (!campaign.ad_groups?.length) {
      errors.push(`campaigns[${index}].ad_groups must not be empty`);
    }
    for (const [gi, group] of (campaign.ad_groups ?? []).entries()) {
      if (!group.name?.trim()) {
        errors.push(`campaigns[${index}].ad_groups[${gi}].name is required`);
      }
      if (!group.cluster_names?.length) {
        errors.push(
          `campaigns[${index}].ad_groups[${gi}].cluster_names must not be empty`,
        );
      }
      for (const clusterName of group.cluster_names ?? []) {
        if (!clusterNames.has(clusterName)) {
          errors.push(`unknown cluster "${clusterName}"`);
        }
        if (assigned.has(clusterName)) {
          errors.push(`cluster "${clusterName}" assigned twice`);
        }
        assigned.add(clusterName);
      }
    }
  }
  for (const cluster of clusters) {
    if (!assigned.has(cluster.name)) {
      errors.push(`cluster "${cluster.name}" is not in the plan`);
    }
  }
  if (errors.length > 0) {
    throw new CampaignPlanValidationError(errors);
  }
}
