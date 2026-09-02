import {
  AnthropicCopywriter,
  GeminiCopywriter,
  GroqCopywriter,
  HeuristicCopywriter,
  resolveCopywritingLlm,
  COPYWRITING_HEURISTIC_FALLBACK_MESSAGE,
} from '@context-buyer/agents';
import type { CopyMarketing, PlatformLimit, SemanticCluster } from '@context-buyer/agents';

const limits: PlatformLimit[] = [
  { elementType: 'headline1', maxLength: 56, maxCount: 1 },
  { elementType: 'headline2', maxLength: 30, maxCount: 1 },
  { elementType: 'description', maxLength: 81, maxCount: 1 },
  { elementType: 'sitelink', maxLength: 30, maxCount: 4 },
  { elementType: 'callout', maxLength: 25, maxCount: 8 },
];

const marketing: CopyMarketing = {
  usp: ['Гарантия 3 года'],
  target_audience: [{ segment: 'геймеры' }],
  forbidden_phrases: [],
  geo: ['RU-MOW'],
};

const cluster: SemanticCluster = {
  cluster_name: 'Asus ROG',
  category: 'brand',
  keywords: [{ phrase: 'купить asus rog', intent: 'hot', frequency: 100 }],
  negative_keywords: [],
};

describe('resolveCopywritingLlm', () => {
  it('uses AnthropicCopywriter when provider is anthropic', () => {
    const { writer, mode } = resolveCopywritingLlm({
      apiKey: 'sk-ant-test',
      provider: 'anthropic',
    });
    expect(mode).toBe('anthropic');
    expect(writer).toBeInstanceOf(AnthropicCopywriter);
  });

  it('uses GroqCopywriter when provider is groq', () => {
    const { writer, mode } = resolveCopywritingLlm({
      apiKey: 'gsk-test',
      provider: 'groq',
    });
    expect(mode).toBe('groq');
    expect(writer).toBeInstanceOf(GroqCopywriter);
    expect(writer).not.toBeInstanceOf(AnthropicCopywriter);
  });

  it('uses GeminiCopywriter when provider is gemini', () => {
    const { writer, mode } = resolveCopywritingLlm({
      apiKey: 'gemini-test',
      provider: 'gemini',
    });
    expect(mode).toBe('gemini');
    expect(writer).toBeInstanceOf(GeminiCopywriter);
    expect(writer).not.toBeInstanceOf(AnthropicCopywriter);
    expect(writer).not.toBeInstanceOf(GroqCopywriter);
  });

  it('falls back to heuristic and calls onFallback without apiKey', () => {
    const onFallback = jest.fn();
    const { writer, mode } = resolveCopywritingLlm({
      apiKey: null,
      onFallback,
    });
    expect(mode).toBe('heuristic');
    expect(writer).toBeInstanceOf(HeuristicCopywriter);
    expect(onFallback).toHaveBeenCalledWith(COPYWRITING_HEURISTIC_FALLBACK_MESSAGE);
  });
});

describe('AnthropicCopywriter (mocked fetch)', () => {
  it('parses cluster creatives from Anthropic JSON response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                cluster_name: 'Asus ROG',
                ab_variants: 2,
                ads: [
                  {
                    ab_group: 'A',
                    headline1: 'Asus ROG — купить',
                    headline2: 'Гарантия 3 года',
                    description: 'Гарантия 3 года для геймеров',
                    sitelinks: ['Гарантия 3 года'],
                    callouts: ['Гарантия 3 года'],
                  },
                  {
                    ab_group: 'B',
                    headline1: 'Купить Asus ROG',
                    headline2: 'Гарантия 3 года',
                    description: 'Гарантия 3 года. Asus ROG',
                    sitelinks: ['Гарантия 3 года'],
                    callouts: ['Гарантия 3 года'],
                  },
                ],
              }),
            },
          ],
          usage: { input_tokens: 120, output_tokens: 80 },
        }),
    });
    const onLlmCall = jest.fn();
    const writer = new AnthropicCopywriter({
      apiKey: 'sk-ant-test',
      fetchImpl: fetchImpl as typeof fetch,
      onLlmCall,
    });
    const result = await writer.writeCluster(cluster, marketing, limits);
    expect(result.ads).toHaveLength(2);
    expect(result.ads[0].headline2).toContain('Гарантия');
    expect(onLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'write_cluster' }),
    );
    expect(fetchImpl).toHaveBeenCalled();
  });
});
