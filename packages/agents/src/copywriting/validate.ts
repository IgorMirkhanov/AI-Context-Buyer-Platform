import Ajv from "ajv";
import { AD_CREATIVES_JSON_SCHEMA } from "./schema";
import { ClusterCreatives } from "./limits";

const ajv = new Ajv({ allErrors: true });
const validateFn = ajv.compile(AD_CREATIVES_JSON_SCHEMA);

export class AdCreativesValidationError extends Error {
  constructor(public readonly details: string[]) {
    super(`ad_creatives failed JSON schema: ${details.join("; ")}`);
    this.name = "AdCreativesValidationError";
  }
}

export function validateAdCreatives(
  payload: unknown,
): asserts payload is ClusterCreatives[] {
  if (!validateFn(payload)) {
    throw new AdCreativesValidationError([
      ajv.errorsText(validateFn.errors, { separator: "; " }),
    ]);
  }
  const creatives = payload as ClusterCreatives[];
  for (const cluster of creatives) {
    if (cluster.ads.length < cluster.ab_variants) {
      throw new AdCreativesValidationError([
        `${cluster.cluster_name}: ads.length < ab_variants`,
      ]);
    }
  }
}
