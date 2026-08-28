import Ajv from "ajv";
import { SEMANTIC_CORE_JSON_SCHEMA } from "./schema";
import { SemanticCore } from "./types";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(SEMANTIC_CORE_JSON_SCHEMA);

export class SemanticCoreValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`semantic_core failed JSON schema: ${details.join("; ")}`);
    this.name = "SemanticCoreValidationError";
  }
}

export function validateSemanticCore(
  payload: unknown,
): asserts payload is SemanticCore {
  if (validateFn(payload)) {
    return;
  }
  throw new SemanticCoreValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}
