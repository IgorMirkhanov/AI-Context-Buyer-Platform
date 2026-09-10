import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('redacts bearer tokens and secret assignments', () => {
    expect(redactSecrets('Authorization Bearer abc.def.ghi')).toContain(
      '[REDACTED]',
    );
    expect(
      redactSecrets('refresh_token=ya29.secret-value-here'),
    ).toContain('[REDACTED]');
    expect(redactSecrets('projectId=p1 events=2')).toBe(
      'projectId=p1 events=2',
    );
  });
});
