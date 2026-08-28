export const SEMANTIC_CORE_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/semantic-core.json",
  type: "object",
  additionalProperties: false,
  required: ["clusters", "global_negatives"],
  properties: {
    clusters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cluster_name", "category", "keywords", "negative_keywords"],
        properties: {
          cluster_name: { type: "string", minLength: 1 },
          category: {
            type: "string",
            enum: ["brand", "feature", "geo", "generic"],
          },
          keywords: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["phrase", "intent", "frequency"],
              properties: {
                phrase: { type: "string", minLength: 1 },
                intent: {
                  type: "string",
                  enum: ["hot", "warm", "navigational"],
                },
                frequency: { type: "number", minimum: 0 },
              },
            },
          },
          negative_keywords: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    global_negatives: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
};
