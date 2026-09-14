/** Exact reason stored on failed agent_tasks.error when the monthly ceiling is hit. */
export const LLM_SPEND_CAP_REACHED = 'LLM spend cap reached';

export class LlmSpendCapReachedError extends Error {
  readonly code = 'LLM_SPEND_CAP_REACHED';

  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(LLM_SPEND_CAP_REACHED);
    this.name = 'LlmSpendCapReachedError';
  }

  /** Human-readable text for API / UI (still contains LLM_SPEND_CAP_REACHED). */
  get uiMessage(): string {
    return (
      `Достигнут месячный лимит расходов на ИИ ` +
      `($${this.spentUsd.toFixed(2)} из $${this.capUsd.toFixed(2)}). ` +
      `Увеличьте лимит в «Настройки → ИИ-провайдер» или дождитесь следующего месяца. ` +
      LLM_SPEND_CAP_REACHED
    );
  }
}

/** UTC month bounds for spend aggregation. */
export function utcMonthRange(now: Date = new Date()): {
  from: Date;
  toExclusive: Date;
} {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const toExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { from, toExclusive };
}
