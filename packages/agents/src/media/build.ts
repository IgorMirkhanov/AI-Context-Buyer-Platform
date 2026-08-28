import { HeuristicMediaPromptWriter, mediaDimensions, sanitizeMediaPrompt } from "./prompts";
import { MediaPlan, MediaPlanInput, MediaPromptWriter } from "./types";
import { validateMediaPlan } from "./validate";

export function buildMediaPlan(
  input: MediaPlanInput,
  writer: MediaPromptWriter = new HeuristicMediaPromptWriter(),
): MediaPlan {
  if (input.clusters.length === 0) {
    throw new Error("semantic_core has no clusters");
  }
  if (input.kinds.length === 0) {
    throw new Error("media kinds are required");
  }
  if (input.marketing.usp.length === 0) {
    throw new Error("marketing.usp is required");
  }

  const items = input.clusters.flatMap((cluster) =>
    input.kinds.map((kind) => {
      const raw = writer.draftPrompt(cluster, input.marketing, kind);
      const prompt = sanitizeMediaPrompt(raw, input.marketing);
      const size = mediaDimensions(kind);
      return {
        cluster_id: cluster.id,
        cluster_name: cluster.name,
        kind,
        prompt,
        width: size.width,
        height: size.height,
        duration_ms: size.duration_ms,
      };
    }),
  );

  const plan: MediaPlan = { items };
  validateMediaPlan(plan);
  return plan;
}
