export type BriefBudget = {
  daily: number;
  currency: string;
};

export type BriefAudienceSegment = {
  segment: string;
  pains?: string[];
  objections?: string[];
};

export type ProjectBriefPayload = {
  project: {
    website_url: string;
    geo: string[];
    budget: BriefBudget;
    target_cpl?: number;
    platforms?: Array<"yandex_direct" | "google_ads">;
  };
  marketing: {
    product_description?: string;
    usp: string[];
    target_audience: BriefAudienceSegment[];
    forbidden_phrases?: string[];
    price_segment?: string;
  };
  exclusions: {
    global_negative_keywords: string[];
    excluded_placements?: string[];
  };
  utm?: { template: string };
  goals?: Array<{ name: string; type: string; external_goal_id?: string }>;
};

/** JSON Schema для payload_json (Этап 1 — стартовый набор полей). */
export const PROJECT_BRIEF_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/project-brief.json",
  type: "object",
  additionalProperties: true,
  required: ["project", "marketing", "exclusions"],
  properties: {
    project: {
      type: "object",
      additionalProperties: true,
      required: ["website_url", "geo", "budget"],
      properties: {
        website_url: { type: "string", minLength: 1 },
        geo: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        budget: {
          type: "object",
          additionalProperties: false,
          required: ["daily", "currency"],
          properties: {
            daily: { type: "number", exclusiveMinimum: 0 },
            currency: { type: "string", minLength: 1 },
          },
        },
        target_cpl: { type: "number" },
        platforms: {
          type: "array",
          items: { type: "string", enum: ["yandex_direct", "google_ads"] },
        },
      },
    },
    marketing: {
      type: "object",
      additionalProperties: true,
      required: ["usp", "target_audience"],
      properties: {
        usp: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        target_audience: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: true,
            required: ["segment"],
            properties: {
              segment: { type: "string", minLength: 1 },
              pains: { type: "array", items: { type: "string" } },
              objections: { type: "array", items: { type: "string" } },
            },
          },
        },
        product_description: { type: "string" },
        forbidden_phrases: { type: "array", items: { type: "string" } },
        price_segment: { type: "string" },
      },
    },
    exclusions: {
      type: "object",
      additionalProperties: true,
      required: ["global_negative_keywords"],
      properties: {
        global_negative_keywords: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        excluded_placements: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
