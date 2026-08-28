export const AD_CREATIVES_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/ad-creatives.json",
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["cluster_name", "ads", "ab_variants"],
    properties: {
      cluster_name: { type: "string", minLength: 1 },
      ab_variants: { type: "integer", minimum: 2 },
      ads: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "ab_group",
            "headline1",
            "headline2",
            "description",
            "sitelinks",
            "callouts",
          ],
          properties: {
            ab_group: { type: "string", minLength: 1 },
            headline1: { type: "string", minLength: 1 },
            headline2: { type: "string" },
            description: { type: "string", minLength: 1 },
            sitelinks: { type: "array", items: { type: "string" } },
            callouts: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};
