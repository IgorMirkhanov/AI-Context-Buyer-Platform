export const AUTOPILOT_GATES = {
  minReviewed: 3,
  minApplied: 2,
  minAcceptRate: 0.5,
};

export type AutopilotStats = {
  applied: number;
  rejected: number;
  failed: number;
  proposed: number;
  approved: number;
};

export type AutopilotEligibility = {
  eligible: boolean;
  reasons: string[];
  stats: AutopilotStats & {
    reviewed: number;
    acceptRate: number | null;
  };
};

export function summarizeAutopilotStats(stats: AutopilotStats): AutopilotEligibility["stats"] {
  const reviewed = stats.applied + stats.rejected;
  const acceptRate =
    reviewed === 0 ? null : roundRate(stats.applied / reviewed);
  return { ...stats, reviewed, acceptRate };
}

export function evaluateAutopilotEligibility(
  stats: AutopilotStats,
): AutopilotEligibility {
  const summary = summarizeAutopilotStats(stats);
  const reasons: string[] = [];
  if (summary.reviewed < AUTOPILOT_GATES.minReviewed) {
    reasons.push(
      `Нужно разобрать минимум ${AUTOPILOT_GATES.minReviewed} рекомендаций (принять/отклонить), сейчас ${summary.reviewed}`,
    );
  }
  if (summary.applied < AUTOPILOT_GATES.minApplied) {
    reasons.push(
      `Нужно успешно применить минимум ${AUTOPILOT_GATES.minApplied} рекомендации, сейчас ${summary.applied}`,
    );
  }
  if (
    summary.acceptRate == null ||
    summary.acceptRate < AUTOPILOT_GATES.minAcceptRate
  ) {
    reasons.push(
      `Доля применённых среди разобранных должна быть ≥ ${AUTOPILOT_GATES.minAcceptRate * 100}%`,
    );
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    stats: summary,
  };
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
