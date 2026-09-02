const campaignSettingsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "type",
    "budget_daily",
    "currency",
    "bidding_strategy",
    "geo",
    "schedule",
    "href",
    "initial_status",
  ],
  properties: {
    name: { type: "string", minLength: 1 },
    type: { type: "string", enum: ["search"] },
    budget_daily: { type: "number", exclusiveMinimum: 0 },
    currency: { type: "string", minLength: 1 },
    bidding_strategy: { type: "string", enum: ["manual_cpc"] },
    geo: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    schedule: {
      type: "object",
      additionalProperties: false,
      required: ["days", "hours"],
      properties: {
        days: { type: "array", items: { type: "string" } },
        hours: { type: "string" },
      },
    },
    href: { type: "string", minLength: 1 },
    initial_status: { type: "string", enum: ["paused"] },
  },
};

const adGroupSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "cluster_name",
    "keywords",
    "negative_keywords",
    "ads",
  ],
  properties: {
    name: { type: "string", minLength: 1 },
    cluster_name: { type: "string", minLength: 1 },
    keywords: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    negative_keywords: {
      type: "array",
      items: { type: "string" },
    },
    ads: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ab_group",
          "creative_ids",
          "headline1",
          "headline2",
          "description",
          "sitelinks",
          "callouts",
          "href",
        ],
        properties: {
          ab_group: { type: "string", minLength: 1 },
          creative_ids: { type: "array", items: { type: "string" } },
          headline1: { type: "string", minLength: 1 },
          headline2: { type: "string" },
          description: { type: "string", minLength: 1 },
          sitelinks: { type: "array", items: { type: "string" } },
          callouts: { type: "array", items: { type: "string" } },
          href: { type: "string", minLength: 1 },
        },
      },
    },
  },
};

export const CAMPAIGN_DRAFT_JSON_SCHEMA = {
  $id: "https://context-buyer.local/schemas/campaign-draft.json",
  type: "object",
  additionalProperties: false,
  required: ["campaigns", "global_negatives"],
  properties: {
    campaigns: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campaign", "ad_groups"],
        properties: {
          campaign: campaignSettingsSchema,
          ad_groups: {
            type: "array",
            minItems: 1,
            items: adGroupSchema,
          },
          publish: { type: "object" },
        },
      },
    },
    global_negatives: { type: "array", items: { type: "string" } },
  },
};
