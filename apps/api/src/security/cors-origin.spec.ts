import { resolveCorsOrigin } from './cors-origin';

describe('resolveCorsOrigin', () => {
  it('defaults to localhost in non-production', () => {
    expect(resolveCorsOrigin('development', undefined)).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects wildcard in any environment', () => {
    expect(() => resolveCorsOrigin('development', '*')).toThrow(/wildcard/);
  });

  it('rejects localhost and http in production', () => {
    expect(() =>
      resolveCorsOrigin('production', 'http://localhost:3000'),
    ).toThrow(/https|localhost/i);
    expect(() => resolveCorsOrigin('production', '*')).toThrow(/wildcard|concrete/);
  });

  it('accepts https origin in production', () => {
    expect(resolveCorsOrigin('production', 'https://app.example.com')).toBe(
      'https://app.example.com',
    );
  });
});
