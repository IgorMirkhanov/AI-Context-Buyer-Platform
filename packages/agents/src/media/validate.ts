import Ajv from "ajv";
import { MEDIA_PLAN_JSON_SCHEMA } from "./schema";
import { MediaPlan } from "./types";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(MEDIA_PLAN_JSON_SCHEMA);

export class MediaPlanValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`media plan failed JSON schema: ${details.join("; ")}`);
    this.name = "MediaPlanValidationError";
  }
}

export function validateMediaPlan(
  payload: unknown,
): asserts payload is MediaPlan {
  if (!validateFn(payload)) {
    throw new MediaPlanValidationError([
      ajv.errorsText(validateFn.errors, { separator: "; " }),
    ]);
  }
  const plan = payload as MediaPlan;
  for (const item of plan.items) {
    if (item.kind === "video" && (item.duration_ms == null || item.duration_ms < 1000)) {
      throw new MediaPlanValidationError([
        `${item.cluster_name}: video requires duration_ms >= 1000`,
      ]);
    }
    if (item.kind === "image" && item.duration_ms != null) {
      throw new MediaPlanValidationError([
        `${item.cluster_name}: image must not set duration_ms`,
      ]);
    }
  }
}
