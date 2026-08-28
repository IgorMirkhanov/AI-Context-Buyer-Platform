export type ProjectBriefPayload = {
  project: {
    website_url: string;
    geo: string[];
    budget: { daily: number; currency: string };
    target_cpl?: number;
    platforms?: Array<'yandex_direct' | 'google_ads'>;
  };
  marketing: {
    product_description?: string;
    usp: string[];
    target_audience: Array<{
      segment: string;
      pains?: string[];
      objections?: string[];
    }>;
    forbidden_phrases?: string[];
    price_segment?: string;
  };
  exclusions: {
    global_negative_keywords: string[];
    excluded_placements?: string[];
  };
};

export const PROJECT_BRIEF_JSON_SCHEMA = {
  $id: 'https://context-buyer.local/schemas/project-brief.json',
  type: 'object',
  additionalProperties: true,
  required: ['project', 'marketing', 'exclusions'],
  properties: {
    project: {
      type: 'object',
      additionalProperties: true,
      required: ['website_url', 'geo', 'budget'],
      properties: {
        website_url: { type: 'string', minLength: 1 },
        geo: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
        budget: {
          type: 'object',
          additionalProperties: false,
          required: ['daily', 'currency'],
          properties: {
            daily: { type: 'number', exclusiveMinimum: 0 },
            currency: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    marketing: {
      type: 'object',
      additionalProperties: true,
      required: ['usp', 'target_audience'],
      properties: {
        usp: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
        target_audience: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['segment'],
            properties: {
              segment: { type: 'string', minLength: 1 },
              pains: { type: 'array', items: { type: 'string' } },
              objections: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    exclusions: {
      type: 'object',
      additionalProperties: true,
      required: ['global_negative_keywords'],
      properties: {
        global_negative_keywords: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};
