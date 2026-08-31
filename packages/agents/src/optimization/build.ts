import { HeuristicOptimizationLlm } from "./llm";
import { proposeRecommendations } from "./rules";
import {
  OptimizationInput,
  OptimizationPlan,
  OptimizationWriter,
} from "./types";
import {
  assertRationaleKeepsFigures,
  validateOptimizationPlan,
} from "./validate";

export async function buildOptimizationPlan(
  input: OptimizationInput,
  writer: OptimizationWriter = new HeuristicOptimizationLlm(),
): Promise<OptimizationPlan> {
  const drafts = proposeRecommendations(input);
  const recommendations = await Promise.all(
    drafts.map(async (item) => {
      const wrapped = await writer.wrap([item.fact]);
      const rationale = wrapped.insights[0] ?? item.fact;
      assertRationaleKeepsFigures(item.fact, rationale);
      const { fact, ...rest } = item;
      return { ...rest, rationale };
    }),
  );
  const plan: OptimizationPlan = {
    period: input.period,
    recommendations,
  };
  validateOptimizationPlan(plan);
  return plan;
}
