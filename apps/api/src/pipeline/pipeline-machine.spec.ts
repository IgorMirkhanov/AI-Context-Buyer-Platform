import { planPipeline, PipelineFacts } from '@context-buyer/agents';

const base: PipelineFacts = {
  hasBrief: false,
  hasSemantic: false,
  hasCreatives: false,
  criticalIssues: 0,
  hasDraft: false,
  draftPendingApproval: false,
  hasLiveCampaign: false,
  hasSnapshots: false,
  runningAgent: null,
  lastFailedAgent: null,
  lastError: null,
};

describe('planPipeline', () => {
  it('stays idle without a brief and never invents a publish step', () => {
    const plan = planPipeline(base);
    expect(plan.stage).toBe('idle');
    expect(plan.nextStep).toBeNull();
    expect(plan.autoRunnable).toBe(false);
  });

  it('runs semantic after the brief, then copy, then builder', () => {
    expect(
      planPipeline({ ...base, hasBrief: true }).nextStep,
    ).toBe('semantic');
    expect(
      planPipeline({ ...base, hasBrief: true, hasSemantic: true }).nextStep,
    ).toBe('copywriting');
    expect(
      planPipeline({
        ...base,
        hasBrief: true,
        hasSemantic: true,
        hasCreatives: true,
      }).nextStep,
    ).toBe('campaign_builder');
  });

  it('stops at awaiting_approval and does not auto-publish', () => {
    const plan = planPipeline({
      ...base,
      hasBrief: true,
      hasSemantic: true,
      hasCreatives: true,
      hasDraft: true,
      draftPendingApproval: true,
    });
    expect(plan.stage).toBe('awaiting_approval');
    expect(plan.nextStep).toBeNull();
    expect(plan.autoRunnable).toBe(false);
    expect(plan.blockedReason).toMatch(/подтверждения/i);
  });

  it('blocks the builder on critical validation issues', () => {
    const plan = planPipeline({
      ...base,
      hasBrief: true,
      hasSemantic: true,
      hasCreatives: true,
      criticalIssues: 2,
    });
    expect(plan.stage).toBe('copy_ready');
    expect(plan.nextStep).toBeNull();
    expect(plan.autoRunnable).toBe(false);
  });

  it('does not re-run the launch pipeline after a live campaign exists', () => {
    const launched = planPipeline({
      ...base,
      hasBrief: true,
      hasSemantic: true,
      hasCreatives: true,
      hasDraft: true,
      hasLiveCampaign: true,
    });
    expect(launched.stage).toBe('launched');
    expect(launched.nextStep).toBeNull();
    const live = planPipeline({
      ...base,
      hasBrief: true,
      hasSemantic: true,
      hasCreatives: true,
      hasDraft: true,
      hasLiveCampaign: true,
      hasSnapshots: true,
    });
    expect(live.stage).toBe('live_optimizing');
    expect(live.nextStep).toBeNull();
  });

  it('retries the failed agent instead of skipping ahead', () => {
    const plan = planPipeline({
      ...base,
      hasBrief: true,
      lastFailedAgent: 'semantic',
      lastError: 'Wordstat timeout',
    });
    expect(plan.stage).toBe('failed');
    expect(plan.nextStep).toBe('semantic');
    expect(plan.autoRunnable).toBe(true);
  });
});
