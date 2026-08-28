export const ATTRIBUTION_SUMMARY_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/attribution-summary.json",
  type: "object",
  additionalProperties: false,
  required: [
    "leads",
    "ads_conversions",
    "spend",
    "attributed_cpl",
    "vs_goal",
    "insights",
  ],
  properties: {
    leads: { type: "number", minimum: 0 },
    ads_conversions: { type: "number", minimum: 0 },
    spend: { type: "number", minimum: 0 },
    attributed_cpl: { type: ["number", "null"] },
    vs_goal: {
      type: "object",
      additionalProperties: false,
      required: ["target_cpl", "actual_cpl", "delta", "status"],
      properties: {
        target_cpl: { type: "number" },
        actual_cpl: { type: ["number", "null"] },
        delta: { type: ["number", "null"] },
        status: {
          type: "string",
          enum: ["better", "worse", "on_target", "no_conversions"],
        },
      },
    },
    insights: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string", minLength: 1 },
    },
  },
};
