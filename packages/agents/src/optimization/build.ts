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

export function buildOptimizationPlan(
  input: OptimizationInput,
  writer: OptimizationWriter = new HeuristicOptimizationLlm(),
): OptimizationPlan {
  const drafts = proposeRecommendations(input);
  const recommendations = drafts.map((item) => {
    const wrapped = writer.wrap([item.fact]);
    const rationale = wrapped.insights[0] ?? item.fact;
    assertRationaleKeepsFigures(item.fact, rationale);
    const { fact, ...rest } = item;
    return { ...rest, rationale };
  });
  const plan: OptimizationPlan = {
    period: input.period,
    recommendations,
  };
  validateOptimizationPlan(plan);
  return plan;
}
