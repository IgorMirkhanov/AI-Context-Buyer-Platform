import Ajv from "ajv";
import { CAMPAIGN_DRAFT_JSON_SCHEMA } from "./schema";
import { CampaignDraftStructure } from "./types";
import { normalizeCampaignDraft } from "./normalize";

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
  const normalized = normalizeCampaignDraft(payload);
  if (validateFn(normalized)) {
    return;
  }
  throw new CampaignDraftValidationError([
    ajv.errorsText(validateFn.errors, { separator: "; " }),
  ]);
}
