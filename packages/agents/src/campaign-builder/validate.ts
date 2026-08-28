import Ajv from "ajv";
import { CAMPAIGN_DRAFT_JSON_SCHEMA } from "./schema";
import { CampaignDraftStructure } from "./types";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(CAMPAIGN_DRAFT_JSON_SCHEMA);

export class CampaignDraftValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`campaign_draft failed JSON schema: ${details.join("; ")}`);
    this.name = "CampaignDraftValidationError";
  }
}

export function validateCampaignDraft(
  payload: unknown,
): asserts payload is CampaignDraftStructure {
  if (validateFn(payload)) {
    return;
  }
  throw new CampaignDraftValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}
