import Ajv from 'ajv';
import { PROJECT_BRIEF_JSON_SCHEMA, ProjectBriefPayload } from './brief.schema';

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(PROJECT_BRIEF_JSON_SCHEMA);

export class BriefValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid project brief: ${details.join('; ')}`);
    this.name = 'BriefValidationError';
  }
}

export function validateProjectBrief(
  payload: unknown,
): asserts payload is ProjectBriefPayload {
  if (validateFn(payload)) {
    return;
  }
  throw new BriefValidationError([
    ajv.errorsText(validateFn.errors, { separator: '; ' }),
  ]);
}
