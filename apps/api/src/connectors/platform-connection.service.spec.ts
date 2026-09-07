import {
  DEFAULT_CONNECTION_VERIFY_THROTTLE_MS,
  shouldVerifyConnection,
  verificationCheckFields,
} from './platform-connection.service';

describe('platform-connection helpers', () => {
  const throttleMs = DEFAULT_CONNECTION_VERIFY_THROTTLE_MS;

  it('requires verify when apiVerifiedAt is missing', () => {
    expect(
      shouldVerifyConnection(null, new Date('2026-09-02T12:00:00.000Z'), throttleMs),
    ).toBe(true);
  });

  it('skips verify inside throttle window', () => {
    const now = new Date('2026-09-02T12:10:00.000Z');
    const last = new Date('2026-09-02T12:00:00.000Z');
    expect(shouldVerifyConnection(last, now, throttleMs)).toBe(false);
  });

  it('runs verify after throttle window', () => {
    const now = new Date('2026-09-02T12:16:00.000Z');
    const last = new Date('2026-09-02T12:00:00.000Z');
    expect(shouldVerifyConnection(last, now, throttleMs)).toBe(true);
  });

  it('stores check timestamp even when verification fails', () => {
    const checkedAt = new Date('2026-09-02T12:00:00.000Z');
    expect(
      verificationCheckFields(
        { ok: false, reason: 'Invalid OAuth token' },
        checkedAt,
      ),
    ).toEqual({
      apiVerifiedAt: checkedAt,
      apiVerificationError: 'Invalid OAuth token',
    });
  });
});
