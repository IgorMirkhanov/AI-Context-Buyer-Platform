import { planPipeline, planFullRunToDraft, PipelineFacts } from '@context-buyer/agents';



const base: PipelineFacts = {

  hasBrief: false,

  hasAnalysis: false,

  hasSemantic: false,

  hasPlan: false,

  planApproved: false,

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



  it('runs analysis after the brief, then waits for manual semantic', () => {

    expect(

      planPipeline({ ...base, hasBrief: true }).nextStep,

    ).toBe('analysis');

    const afterAnalysis = planPipeline({

      ...base,

      hasBrief: true,

      hasAnalysis: true,

    });

    expect(afterAnalysis.stage).toBe('analysis_ready');

    expect(afterAnalysis.nextStep).toBeNull();

    expect(afterAnalysis.autoRunnable).toBe(false);

    expect(afterAnalysis.blockedReason).toMatch(/Анализ готов/i);

  });



  it('runs plan preview after semantic, then waits for approval', () => {

    expect(

      planPipeline({

        ...base,

        hasBrief: true,

        hasAnalysis: true,

        hasSemantic: true,

      }).nextStep,

    ).toBe('plan_preview');

    const afterPlan = planPipeline({

      ...base,

      hasBrief: true,

      hasAnalysis: true,

      hasSemantic: true,

      hasPlan: true,

      planApproved: false,

    });

    expect(afterPlan.stage).toBe('plan_ready');

    expect(afterPlan.nextStep).toBeNull();

    expect(afterPlan.blockedReason).toMatch(/План готов/i);

  });



  it('runs copy after approved plan, then builder', () => {

    expect(

      planPipeline({

        ...base,

        hasBrief: true,

        hasAnalysis: true,

        hasSemantic: true,

        hasPlan: true,

        planApproved: true,

      }).nextStep,

    ).toBe('copywriting');

    expect(

      planPipeline({

        ...base,

        hasBrief: true,

        hasAnalysis: true,

        hasSemantic: true,

        hasPlan: true,

        planApproved: true,

        hasCreatives: true,

      }).nextStep,

    ).toBe('campaign_builder');

  });



  it('stops at awaiting_approval and does not auto-publish', () => {

    const plan = planPipeline({

      ...base,

      hasBrief: true,

      hasAnalysis: true,

      hasSemantic: true,

      hasPlan: true,

      planApproved: true,

      hasCreatives: true,

      hasDraft: true,

      draftPendingApproval: true,

    });

    expect(plan.stage).toBe('awaiting_approval');

    expect(plan.nextStep).toBeNull();

    expect(plan.autoRunnable).toBe(false);

    expect(plan.blockedReason).toMatch(/отмените|доработать/i);

  });



  it('blocks the builder on critical validation issues', () => {

    const plan = planPipeline({

      ...base,

      hasBrief: true,

      hasAnalysis: true,

      hasSemantic: true,

      hasPlan: true,

      planApproved: true,

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

      hasAnalysis: true,

      hasSemantic: true,

      hasPlan: true,

      planApproved: true,

      hasCreatives: true,

      hasDraft: true,

      hasLiveCampaign: true,

    });

    expect(launched.stage).toBe('launched');

    expect(launched.nextStep).toBeNull();

    const live = planPipeline({

      ...base,

      hasBrief: true,

      hasAnalysis: true,

      hasSemantic: true,

      hasPlan: true,

      planApproved: true,

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

describe('planFullRunToDraft', () => {
  it('runs semantic after analysis without manual gate', () => {
    const full = planFullRunToDraft({
      ...base,
      hasBrief: true,
      hasAnalysis: true,
    });
    expect(full.stage).toBe('analysis_ready');
    expect(full.action).toBe('semantic');
    expect(full.runnable).toBe(true);
  });

  it('auto-approves plan at plan_ready', () => {
    const full = planFullRunToDraft({
      ...base,
      hasBrief: true,
      hasAnalysis: true,
      hasSemantic: true,
      hasPlan: true,
      planApproved: false,
    });
    expect(full.stage).toBe('plan_ready');
    expect(full.action).toBe('approve_plan');
    expect(full.runnable).toBe(true);
  });

  it('stops at awaiting_approval', () => {
    const full = planFullRunToDraft({
      ...base,
      hasBrief: true,
      hasAnalysis: true,
      hasSemantic: true,
      hasPlan: true,
      planApproved: true,
      hasCreatives: true,
      hasDraft: true,
      draftPendingApproval: true,
    });
    expect(full.runnable).toBe(false);
    expect(full.action).toBeNull();
  });
});

