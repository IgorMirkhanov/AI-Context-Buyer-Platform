import {
  agentAcceptance,
  clusterEditAcceptance,
} from '@context-buyer/agents';

describe('agentAcceptance', () => {
  it('returns null share when there is nothing to accept', () => {
    expect(agentAcceptance({ total: 0, edited: 0 })).toEqual({
      total: 0,
      edited: 0,
      acceptedShare: null,
    });
  });

  it('treats unedited items as accepted', () => {
    expect(agentAcceptance({ total: 10, edited: 2 })).toEqual({
      total: 10,
      edited: 2,
      acceptedShare: 0.8,
    });
  });

  it('clamps edited count to the total', () => {
    expect(agentAcceptance({ total: 4, edited: 9 }).edited).toBe(4);
    expect(agentAcceptance({ total: 4, edited: 9 }).acceptedShare).toBe(0);
  });
});

describe('clusterEditAcceptance', () => {
  it('counts a cluster once if any creative was edited', () => {
    expect(
      clusterEditAcceptance([
        { clusterId: 'c1', edited: true },
        { clusterId: 'c1', edited: false },
        { clusterId: 'c2', edited: false },
      ]),
    ).toEqual({
      total: 2,
      edited: 1,
      acceptedShare: 0.5,
    });
  });
});
