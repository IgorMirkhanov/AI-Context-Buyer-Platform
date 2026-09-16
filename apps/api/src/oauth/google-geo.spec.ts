import {
  googleGeoTargetConstants,
  googleGeoTargetConstantsForKeywordIdeas,
} from '@context-buyer/connectors';

describe('google geo targets', () => {
  it('maps city codes for campaign targeting', () => {
    expect(googleGeoTargetConstants(['RU-MOW'])).toEqual([
      'geoTargetConstants/1011969',
    ]);
    expect(googleGeoTargetConstants(['KZ-ALA'])).toEqual([
      'geoTargetConstants/1028243',
    ]);
  });

  it('maps Keyword Planner ideas to country-level constants', () => {
    expect(googleGeoTargetConstantsForKeywordIdeas(['RU-MOW'])).toEqual([
      'geoTargetConstants/2643',
    ]);
    expect(googleGeoTargetConstantsForKeywordIdeas(['KZ-ALA'])).toEqual([
      'geoTargetConstants/2398',
    ]);
    expect(googleGeoTargetConstantsForKeywordIdeas(['RU'])).toEqual([
      'geoTargetConstants/2643',
    ]);
  });
});
