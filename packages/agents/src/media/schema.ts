export const MEDIA_PLAN_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/media-plan.json",
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "cluster_id",
          "cluster_name",
          "kind",
          "prompt",
          "width",
          "height",
          "duration_ms",
        ],
        properties: {
          cluster_id: { type: "string", minLength: 1 },
          cluster_name: { type: "string", minLength: 1 },
          kind: { type: "string", enum: ["image", "video"] },
          prompt: { type: "string", minLength: 1, maxLength: 1500 },
          width: { type: "integer", minimum: 1 },
          height: { type: "integer", minimum: 1 },
          duration_ms: { type: ["integer", "null"] },
        },
      },
    },
  },
};
