import Ajv from "ajv";
import { PERFORMANCE_REPORT_JSON_SCHEMA } from "./schema";
import { PerformanceReport } from "./types";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(PERFORMANCE_REPORT_JSON_SCHEMA);

export class PerformanceReportValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`performance report failed JSON schema: ${details.join("; ")}`);
    this.name = "PerformanceReportValidationError";
  }
}

export function validatePerformanceReport(
  payload: unknown,
): asserts payload is PerformanceReport {
  if (validateFn(payload)) {
    return;
  }
  throw new PerformanceReportValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}
