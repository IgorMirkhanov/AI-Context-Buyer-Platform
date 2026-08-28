export const PERFORMANCE_REPORT_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/performance-report.json",
  type: "object",
  additionalProperties: false,
  required: ["period", "metrics", "vs_goal", "insights"],
  properties: {
    period: {
      type: "object",
      additionalProperties: false,
      required: ["from", "to"],
      properties: {
        from: { type: "string", minLength: 1 },
        to: { type: "string", minLength: 1 },
      },
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: [
        "impressions",
        "clicks",
        "spend",
        "conversions",
        "ctr",
        "cpc",
        "cpl",
      ],
      properties: {
        impressions: { type: "number", minimum: 0 },
        clicks: { type: "number", minimum: 0 },
        spend: { type: "number", minimum: 0 },
        conversions: { type: "number", minimum: 0 },
        ctr: { type: "number" },
        cpc: { type: "number" },
        cpl: { type: ["number", "null"] },
      },
    },
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
