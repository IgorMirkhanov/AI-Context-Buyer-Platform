import {
  buildCampaignDraft,
  CampaignPlan,
  HeuristicCampaignPlanWriter,
} from '@context-buyer/agents';

const baseInput = {
  projectName: 'Asus Gaming',
  websiteUrl: 'https://asus-gaming.example',
  geo: ['RU-MOW'],
  budgetDaily: 5000,
  currency: 'RUB',
  global_negatives: ['бесплатно'],
  clusters: [
    {
      name: 'Asus ROG',
      keywords: ['купить asus rog'],
      negative_keywords: ['купить hp omen'],
      ads: [
        {
          ab_group: 'A',
          creative_ids: ['c1'],
          headline1: 'Игровые ноутбуки Asus',
          headline2: 'Гарантия 3 года',
          description: 'Официальный магазин. Склад в Москве',
          sitelinks: ['Каталог ROG'],
          callouts: ['Гарантия 3 года'],
        },
      ],
    },
    {
      name: 'HP Omen',
      keywords: ['купить hp omen'],
      negative_keywords: ['купить asus rog'],
      ads: [
        {
          ab_group: 'A',
          creative_ids: ['c2'],
          headline1: 'HP Omen купить',
          headline2: 'Доставка по РФ',
          description: 'Официальный дилер',
          sitelinks: ['Каталог'],
          callouts: ['Гарантия'],
        },
      ],
    },
  ],
};

describe('Campaign plan → draft', () => {
  it('heuristic plan with brand + geo clusters yields two campaigns in draft', async () => {
    const writer = new HeuristicCampaignPlanWriter();
    const { plan } = await writer.plan(
      {
        project_name: baseInput.projectName,
        geo: baseInput.geo,
        usp: ['игровые ноутбуки'],
        target_audience: ['геймеры'],
      },
      [
        {
          name: 'Asus ROG',
          category: 'brand',
          keyword_count: 1,
          sample_keywords: ['купить asus rog'],
        },
        {
          name: 'Москва ноутбуки',
          category: 'geo',
          keyword_count: 1,
          sample_keywords: ['ноутбуки москва'],
        },
      ],
    );
    expect(plan.campaigns).toHaveLength(2);
    expect(plan.campaigns[0].rationale.length).toBeGreaterThan(10);
    expect(plan.campaigns[1].ad_groups.length).toBeGreaterThan(0);

    const draft = buildCampaignDraft(
      {
        ...baseInput,
        clusters: [
          {
            ...baseInput.clusters[0],
            name: 'Asus ROG',
          },
          {
            name: 'Москва ноутбуки',
            keywords: ['ноутбуки москва'],
            negative_keywords: [],
            ads: baseInput.clusters[0].ads,
          },
        ],
      },
      plan as CampaignPlan,
    );
    expect(draft.campaigns).toHaveLength(plan.campaigns.length);
    expect(draft.campaigns[0].ad_groups[0].keywords).toContain('купить asus rog');
    expect(draft.campaigns[1].ad_groups[0].keywords).toContain('ноутбуки москва');
  });
});
