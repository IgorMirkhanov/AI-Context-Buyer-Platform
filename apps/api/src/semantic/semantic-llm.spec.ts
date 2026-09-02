import {
  AnthropicSemanticLlm,
  GeminiSemanticLlm,
  GroqSemanticLlm,
  HeuristicSemanticLlm,
  resolveSemanticLlm,
  SEMANTIC_HEURISTIC_FALLBACK_MESSAGE,
  suggestNearIntentStep,
  suggestFromSeedWordsStep,
  suggestNegativeWordsStep,
  GROQ_OPENAI_BASE_URL,
  GEMINI_OPENAI_BASE_URL,
  parseJsonFromGeminiLlm,
} from '@context-buyer/agents';
import { anthropicMessages } from '@context-buyer/agents/llm/anthropic-client';
import type { SemanticLlm, SemanticBriefInput } from '@context-buyer/agents';

const brief: SemanticBriefInput = {
  geo: ['RU-MOW'],
  usp: ['установка брекетов под ключ'],
  target_audience: [{ segment: 'взрослые' }],
  global_negative_keywords: ['бесплатно'],
};

describe('resolveSemanticLlm', () => {
  it('uses AnthropicSemanticLlm when apiKey is present and provider is anthropic', () => {
    const { llm, mode } = resolveSemanticLlm({
      apiKey: 'sk-ant-test',
      provider: 'anthropic',
    });
    expect(mode).toBe('anthropic');
    expect(llm).toBeInstanceOf(AnthropicSemanticLlm);
    expect(llm).not.toBeInstanceOf(GroqSemanticLlm);
  });

  it('uses GroqSemanticLlm when provider is groq', () => {
    const { llm, mode } = resolveSemanticLlm({
      apiKey: 'gsk-test',
      provider: 'groq',
    });
    expect(mode).toBe('groq');
    expect(llm).toBeInstanceOf(GroqSemanticLlm);
    expect(llm).not.toBeInstanceOf(AnthropicSemanticLlm);
    expect(llm).not.toBeInstanceOf(GeminiSemanticLlm);
  });

  it('uses GeminiSemanticLlm when provider is gemini', () => {
    const { llm, mode } = resolveSemanticLlm({
      apiKey: 'gemini-test',
      provider: 'gemini',
    });
    expect(mode).toBe('gemini');
    expect(llm).toBeInstanceOf(GeminiSemanticLlm);
    expect(llm).not.toBeInstanceOf(AnthropicSemanticLlm);
    expect(llm).not.toBeInstanceOf(GroqSemanticLlm);
  });

  it('defaults to anthropic when provider is omitted', () => {
    const { llm, mode } = resolveSemanticLlm({ apiKey: 'sk-ant-test' });
    expect(mode).toBe('anthropic');
    expect(llm).toBeInstanceOf(AnthropicSemanticLlm);
  });

  it('falls back to heuristic for openai provider', () => {
    const onFallback = jest.fn();
    const { llm, mode } = resolveSemanticLlm({
      apiKey: 'sk-openai-test',
      provider: 'openai',
      onFallback,
    });
    expect(mode).toBe('heuristic');
    expect(llm).toBeInstanceOf(HeuristicSemanticLlm);
    expect(onFallback).toHaveBeenCalled();
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

describe('GeminiSemanticLlm (mocked fetch)', () => {
  it('parses near-intent phrases from Gemini OpenAI-compatible response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: 'gemini-3.6-flash',
          choices: [
            {
              message: {
                content:
                  'Here is the JSON:\n{"phrases":["брекеты для взрослых","записаться на брекеты"]}',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 40 },
        }),
    });
    const llm = new GeminiSemanticLlm({
      apiKey: 'gemini-test',
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
    expect(fetchImpl).toHaveBeenCalledWith(
      `${GEMINI_OPENAI_BASE_URL}chat/completions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer gemini-test',
        }),
      }),
    );
  });
});

describe('parseJsonFromGeminiLlm', () => {
  it('parses JSON after Gemini preamble text', () => {
    const parsed = parseJsonFromGeminiLlm<{ phrases: string[] }>(
      'Sure! {"phrases":["a","b"]}',
    );
    expect(parsed?.phrases).toEqual(['a', 'b']);
  });
});

describe('GroqSemanticLlm (mocked fetch)', () => {
  it('parses near-intent phrases from Groq OpenAI-compatible response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: 'llama-3.1-8b-instant',
          choices: [
            {
              message: {
                content:
                  '{"phrases":["брекеты для взрослых","записаться на брекеты"]}',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 40 },
        }),
    });
    const llm = new GroqSemanticLlm({
      apiKey: 'gsk-test',
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
    expect(fetchImpl).toHaveBeenCalledWith(
      `${GROQ_OPENAI_BASE_URL}/chat/completions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer gsk-test',
        }),
      }),
    );
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
      suggestFromSeedWords: jest.fn(),
      suggestNegativeWords: jest.fn(),
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

describe('suggestFromSeedWordsStep', () => {
  it('merges LLM phrases from manual seeds with llm_seed_expand source', async () => {
    const llm: SemanticLlm = {
      extractMasks: jest.fn(),
      classifyIntents: jest.fn(),
      nameCluster: jest.fn(),
      suggestNearIntentPhrases: jest.fn(),
      suggestFromSeedWords: jest.fn().mockResolvedValue({
        phrases: ['закупка ноутбуков оптом'],
        usage: {
          step: 'suggest_from_seed_words',
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
    const merged = await suggestFromSeedWordsStep(
      [
        {
          phrase: 'ноутбук для офиса',
          frequency: 100,
          source: 'mock_wordstat',
        },
      ],
      brief,
      ['ноутбук для офиса', 'crm b2b'],
      llm,
    );
    expect(llm.suggestFromSeedWords).toHaveBeenCalledWith(
      brief,
      ['ноутбук для офиса', 'crm b2b'],
      ['ноутбук для офиса'],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      phrase: 'закупка ноутбуков оптом',
      source: 'llm_seed_expand',
      frequency: 1,
    });
  });

  it('skips LLM when manual seeds are empty', async () => {
    const llm: SemanticLlm = {
      extractMasks: jest.fn(),
      classifyIntents: jest.fn(),
      nameCluster: jest.fn(),
      suggestNearIntentPhrases: jest.fn(),
      suggestFromSeedWords: jest.fn(),
      suggestNegativeWords: jest.fn(),
    };
    const ideas = [
      { phrase: 'ноутбук для офиса', frequency: 100, source: 'mock_wordstat' },
    ];
    const merged = await suggestFromSeedWordsStep(ideas, brief, [], llm);
    expect(merged).toBe(ideas);
    expect(llm.suggestFromSeedWords).not.toHaveBeenCalled();
  });
});

describe('suggestNegativeWordsStep', () => {
  it('returns filtered negatives and skips words already in brief', async () => {
    const llm: SemanticLlm = {
      extractMasks: jest.fn(),
      classifyIntents: jest.fn(),
      nameCluster: jest.fn(),
      suggestNearIntentPhrases: jest.fn(),
      suggestFromSeedWords: jest.fn(),
      suggestNegativeWords: jest.fn().mockResolvedValue({
        negatives: [
          { phrase: 'бесплатно', reason: 'уже в брифе' },
          { phrase: 'самолечение', reason: 'DIY' },
          { phrase: 'видео', reason: 'развлекательный интент' },
        ],
        usage: {
          step: 'suggest_negative_words',
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
    const result = await suggestNegativeWordsStep(
      brief,
      [
        {
          phrase: 'лечение кариеса видео',
          intent: 'warm',
          frequency: 10,
          source: 'mock',
        },
      ],
      llm,
    );
    expect(result).toEqual([
      { phrase: 'самолечение', reason: 'DIY' },
      { phrase: 'видео', reason: 'развлекательный интент' },
    ]);
  });

  it('returns empty list when heuristic has no suggestions', async () => {
    const llm = new HeuristicSemanticLlm();
    const result = await suggestNegativeWordsStep(
      brief,
      [{ phrase: 'тест', intent: 'hot', frequency: 1, source: 'mock' }],
      llm,
    );
    expect(result).toEqual([]);
  });
});

describe('anthropicMessages timeout', () => {
  it('passes AbortSignal.timeout to fetch', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: '{"masks":[]}' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
    });
    await anthropicMessages({
      apiKey: 'sk-test',
      fetchImpl: fetchImpl as typeof fetch,
      system: 'test',
      user: 'test',
      timeoutMs: 9000,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
