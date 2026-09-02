import {
  AnthropicOptimizationLlm,
  GeminiOptimizationLlm,
  GroqOptimizationLlm,
  HeuristicOptimizationLlm,
  resolveOptimizationLlm,
  OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE,
} from '@context-buyer/agents';

describe('resolveOptimizationLlm', () => {
  it('uses AnthropicOptimizationLlm when provider is anthropic', () => {
    const { writer, mode } = resolveOptimizationLlm({
      apiKey: 'sk-ant-test',
      provider: 'anthropic',
    });
    expect(mode).toBe('anthropic');
    expect(writer).toBeInstanceOf(AnthropicOptimizationLlm);
  });

  it('uses GroqOptimizationLlm when provider is groq', () => {
    const { writer, mode } = resolveOptimizationLlm({
      apiKey: 'gsk-test',
      provider: 'groq',
    });
    expect(mode).toBe('groq');
    expect(writer).toBeInstanceOf(GroqOptimizationLlm);
    expect(writer).not.toBeInstanceOf(AnthropicOptimizationLlm);
  });

  it('uses GeminiOptimizationLlm when provider is gemini', () => {
    const { writer, mode } = resolveOptimizationLlm({
      apiKey: 'gemini-test',
      provider: 'gemini',
    });
    expect(mode).toBe('gemini');
    expect(writer).toBeInstanceOf(GeminiOptimizationLlm);
    expect(writer).not.toBeInstanceOf(AnthropicOptimizationLlm);
    expect(writer).not.toBeInstanceOf(GroqOptimizationLlm);
  });

  it('falls back to heuristic and calls onFallback without apiKey', () => {
    const onFallback = jest.fn();
    const { writer, mode } = resolveOptimizationLlm({
      apiKey: null,
      onFallback,
    });
    expect(mode).toBe('heuristic');
    expect(writer).toBeInstanceOf(HeuristicOptimizationLlm);
    expect(onFallback).toHaveBeenCalledWith(OPTIMIZATION_HEURISTIC_FALLBACK_MESSAGE);
  });
});

describe('AnthropicOptimizationLlm (mocked fetch)', () => {
  it('parses insights from Anthropic JSON response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '{"insights":["Клики 40, расход 800, конверсий 0 — рекомендую паузу."]}',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
    });
    const llm = new AnthropicOptimizationLlm({
      apiKey: 'sk-ant-test',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const fact =
      'Клики 40, расход 800, конверсий 0 (CTR 5%) → рекомендую отключить кампанию.';
    const result = await llm.wrap([fact]);
    expect(result.insights[0]).toContain('800');
    expect(result.insights[0]).toContain('0');
    expect(fetchImpl).toHaveBeenCalled();
  });
});
