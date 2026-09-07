import { mapYandexCampaignState } from '@context-buyer/connectors';

describe('mapYandexCampaignState', () => {
  it('maps archived Yandex states to archived', () => {
    expect(mapYandexCampaignState('ARCHIVED', 'ACCEPTED')).toBe('archived');
    expect(mapYandexCampaignState('ENDED', 'ACCEPTED')).toBe('archived');
  });

  it('maps ON to active and others to paused', () => {
    expect(mapYandexCampaignState('ON', 'ACCEPTED')).toBe('active');
    expect(mapYandexCampaignState('OFF', 'ACCEPTED')).toBe('paused');
    expect(mapYandexCampaignState('SUSPENDED', 'ACCEPTED')).toBe('paused');
  });
});
