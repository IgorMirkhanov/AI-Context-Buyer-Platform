import {
  LLM_SPEND_CAP_REACHED,
  LlmSpendCapReachedError,
  utcMonthRange,
} from './llm-spend-cap';

describe('llm-spend-cap helpers', () => {
  it('uses UTC calendar month bounds', () => {
    const { from, toExclusive } = utcMonthRange(
      new Date('2026-09-14T15:00:00.000Z'),
    );
    expect(from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(toExclusive.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('exposes a stable task-error reason', () => {
    const err = new LlmSpendCapReachedError(12, 10);
    expect(err.message).toBe(LLM_SPEND_CAP_REACHED);
    expect(err.uiMessage).toContain(LLM_SPEND_CAP_REACHED);
    expect(err.uiMessage).toContain('$12.00');
    expect(err.uiMessage).toContain('$10.00');
  });
});
