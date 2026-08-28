import Ajv from "ajv";
import { ATTRIBUTION_SUMMARY_JSON_SCHEMA } from "./schema";
import { AttributionSummary } from "./summary";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(ATTRIBUTION_SUMMARY_JSON_SCHEMA);

export class AttributionSummaryValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`attribution summary failed JSON schema: ${details.join("; ")}`);
    this.name = "AttributionSummaryValidationError";
  }
}

export function validateAttributionSummary(
  payload: unknown,
): asserts payload is AttributionSummary {
  if (validateFn(payload)) {
    return;
  }
  throw new AttributionSummaryValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}
