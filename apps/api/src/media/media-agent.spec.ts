import {
  buildMediaPlan,
  HeuristicMediaPromptWriter,
  MediaPlanValidationError,
  MediaPromptWriter,
  sanitizeMediaPrompt,
  validateMediaPlan,
} from '@context-buyer/agents';

const marketing = {
  usp: ['Гарантия 3 года', 'Бесплатная доставка по РФ'],
  target_audience: [{ segment: 'геймеры 18-30' }],
  forbidden_phrases: ['самый дешёвый', 'без предоплаты'],
  geo: ['RU-MOW'],
  product_description: 'Игровые ноутбуки',
};

const clusters = [
  { id: 'cluster-1', name: 'Asus ROG' },
  { id: 'cluster-2', name: 'HP Omen' },
];

class LeakyMediaWriter implements MediaPromptWriter {
  draftPrompt() {
    return 'Buy the самый дешёвый laptop без предоплаты. Cheap stock photo.';
  }
}

describe('Media Agent', () => {
  it('puts USP into every prompt and strips forbidden phrases from a leaky writer', () => {
    const plan = buildMediaPlan(
      { clusters, marketing, kinds: ['image'] },
      new LeakyMediaWriter(),
    );
    expect(plan.items).toHaveLength(2);
    for (const item of plan.items) {
      expect(item.prompt).toContain('Гарантия 3 года');
      expect(item.prompt.toLowerCase()).not.toContain('самый дешёвый');
      expect(item.prompt.toLowerCase()).not.toContain('без предоплаты');
      expect(item.kind).toBe('image');
      expect(item.duration_ms).toBeNull();
      expect(item.width).toBe(1024);
    }
  });

  it('builds image and video items per cluster with the heuristic writer', () => {
    const plan = buildMediaPlan(
      { clusters: [clusters[0]], marketing, kinds: ['image', 'video'] },
      new HeuristicMediaPromptWriter(),
    );
    expect(plan.items).toHaveLength(2);
    const image = plan.items.find((item) => item.kind === 'image');
    const video = plan.items.find((item) => item.kind === 'video');
    expect(image?.prompt).toMatch(/no text overlay/i);
    expect(image?.prompt).toContain('Asus ROG');
    expect(image?.prompt).toContain('Гарантия 3 года');
    expect(video?.duration_ms).toBe(5000);
    expect(video?.width).toBe(1280);
  });

  it('rejects a plan that drops required fields', () => {
    expect(() =>
      validateMediaPlan({
        items: [
          {
            cluster_id: 'x',
            cluster_name: 'Asus',
            kind: 'image',
            prompt: '',
            width: 1024,
            height: 1024,
            duration_ms: null,
          },
        ],
      }),
    ).toThrow(MediaPlanValidationError);
  });

  it('rejects video without duration', () => {
    expect(() =>
      validateMediaPlan({
        items: [
          {
            cluster_id: 'x',
            cluster_name: 'Asus',
            kind: 'video',
            prompt: 'Offer: Гарантия 3 года. clip',
            width: 1280,
            height: 720,
            duration_ms: null,
          },
        ],
      }),
    ).toThrow(/duration_ms/);
  });

  it('re-injects USP after sanitizing', () => {
    const prompt = sanitizeMediaPrompt('самый дешёвый stock photo', marketing);
    expect(prompt).toContain('Гарантия 3 года');
    expect(prompt.toLowerCase()).not.toContain('самый дешёвый');
  });
});
