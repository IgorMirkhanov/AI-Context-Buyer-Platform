import {
  AnthropicSemanticLlm,
  HeuristicSemanticLlm,
  resolveSemanticLlm,
  SEMANTIC_HEURISTIC_FALLBACK_MESSAGE,
  suggestNearIntentStep,
} from '@context-buyer/agents';
import type { SemanticLlm, SemanticBriefInput } from '@context-buyer/agents';

const brief: SemanticBriefInput = {
  geo: ['RU-MOW'],
  usp: ['установка брекетов под ключ'],
  target_audience: [{ segment: 'взрослые' }],
  global_negative_keywords: ['бесплатно'],
};

describe('resolveSemanticLlm', () => {
  it('uses AnthropicSemanticLlm when apiKey is present', () => {
    const { llm, mode } = resolveSemanticLlm({ apiKey: 'sk-ant-test' });
    expect(mode).toBe('anthropic');
    expect(llm).toBeInstanceOf(AnthropicSemanticLlm);
  });

  it('falls back to heuristic and calls onFallback without apiKey', () => {
    const onFallback = jest.fn();
    const { llm, mode } = resolveSemanticLlm({
      apiKey: null,
      onFallback,
    });
    expect(mode).toBe('heuristic');
    expect(llm).toBeInstanceOf(HeuristicSemanticLlm);
    expect(onFallback).toHaveBeenCalledWith(SEMANTIC_HEURISTIC_FALLBACK_MESSAGE);
  });
});

describe('AnthropicSemanticLlm (mocked fetch)', () => {
  it('parses near-intent phrases from Anthropic JSON response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '{"phrases":["брекеты для взрослых","записаться на брекеты"]}',
            },
          ],
          usage: { input_tokens: 100, output_tokens: 40 },
        }),
    });
    const llm = new AnthropicSemanticLlm({
      apiKey: 'sk-ant-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await llm.suggestNearIntentPhrases(brief, [
      'установка брекетов под ключ',
    ]);
    expect(result.phrases).toEqual([
      'брекеты для взрослых',
      'записаться на брекеты',
    ]);
    expect(result.usage.step).toBe('suggest_near_intent');
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('suggestNearIntentStep', () => {
  it('merges LLM phrases into ideas with llm_near_intent source', async () => {
    const llm: SemanticLlm = {
      extractMasks: jest.fn(),
      classifyIntents: jest.fn(),
      nameCluster: jest.fn(),
      suggestNearIntentPhrases: jest.fn().mockResolvedValue({
        phrases: ['бухгалтер для ип удаленно'],
        usage: {
          step: 'suggest_near_intent',
          model: 'mock',
          prompt: '',
          response: '',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0,
          latencyMs: 1,
        },
      }),
    };
    const merged = await suggestNearIntentStep(
      [
        {
          phrase: 'бухгалтерский аутсорсинг для ип',
          frequency: 100,
          source: 'mock_wordstat',
        },
      ],
      brief,
      llm,
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      phrase: 'бухгалтер для ип удаленно',
      source: 'llm_near_intent',
      frequency: 1,
    });
  });
});
