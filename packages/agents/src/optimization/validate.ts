import Ajv from "ajv";
import { OPTIMIZATION_PLAN_JSON_SCHEMA } from "./schema";
import { OptimizationPlan } from "./types";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(OPTIMIZATION_PLAN_JSON_SCHEMA);

export class OptimizationPlanValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`optimization plan failed JSON schema: ${details.join("; ")}`);
    this.name = "OptimizationPlanValidationError";
  }
}

export function validateOptimizationPlan(
  payload: unknown,
): asserts payload is OptimizationPlan {
  if (validateFn(payload)) {
    return;
  }
  throw new OptimizationPlanValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}

export function figuresFromText(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

export function assertRationaleKeepsFigures(
  fact: string,
  rationale: string,
): void {
  for (const num of figuresFromText(fact)) {
    if (!rationale.includes(num)) {
      throw new Error(`Optimization LLM dropped computed figure ${num}`);
    }
  }
}
