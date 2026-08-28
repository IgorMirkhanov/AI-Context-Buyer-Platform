import { SemanticCore } from "../semantic/types";
import {
  Copywriter,
  HeuristicCopywriter,
  sanitizeClusterCreatives,
} from "./generate";
import { ClusterCreatives, CopyMarketing, PlatformLimit } from "./limits";
import { validateAdCreatives } from "./validate";
import { validateCreatives, ValidationResult } from "../validation/validate";

export function runCopywriting(
  core: SemanticCore,
  marketing: CopyMarketing,
  limits: PlatformLimit[],
  writer: Copywriter = new HeuristicCopywriter(),
): ClusterCreatives[] {
  if (core.clusters.length === 0) {
    throw new Error("semantic_core has no clusters");
  }
  const creatives = core.clusters.map((cluster) =>
    sanitizeClusterCreatives(
      writer.writeCluster(cluster, marketing, limits),
      marketing,
      limits,
    ),
  );
  validateAdCreatives(creatives);
  return creatives;
}

export function runCopyAndValidate(
  core: SemanticCore,
  marketing: CopyMarketing,
  limits: PlatformLimit[],
  writer: Copywriter = new HeuristicCopywriter(),
): ValidationResult {
  const creatives = runCopywriting(core, marketing, limits, writer);
  return validateCreatives(creatives, core, marketing, limits);
}
