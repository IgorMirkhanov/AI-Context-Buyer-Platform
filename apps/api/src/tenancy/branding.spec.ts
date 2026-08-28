import {
  brandingToJson,
  resolveBranding,
  sanitizeHex,
  sanitizeHttpsUrl,
  sanitizeSlug,
} from './branding';

describe('white-label branding sanitizer', () => {
  it('resolves product name from branding JSON without leaking another org', () => {
    const branding = resolveBranding({
      name: 'Acme Agency',
      slug: 'acme',
      brandingJson: {
        productName: 'Acme Ads',
        logoUrl: 'https://cdn.example.com/logo.png',
        accentColor: '#112233',
        supportEmail: 'help@acme.test',
        hidePlatformBadge: true,
      },
    });
    expect(branding.productName).toBe('Acme Ads');
    expect(branding.slug).toBe('acme');
    expect(branding.hidePlatformBadge).toBe(true);
  });

  it('falls back to organization name and default accent', () => {
    const branding = resolveBranding({ name: 'Agency', slug: null, brandingJson: null });
    expect(branding.productName).toBe('Agency');
    expect(branding.accentColor).toBe('#18181b');
    expect(branding.logoUrl).toBeNull();
  });

  it('rejects javascript URLs, credentials in URLs, and invalid slugs', () => {
    expect(sanitizeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpsUrl('https://user:pass@cdn.example.com/x.png')).toBeNull();
    expect(sanitizeHttpsUrl('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png',
    );
    expect(sanitizeSlug('Acme Ads')).toBeNull();
    expect(sanitizeSlug('acme')).toBe('acme');
    expect(sanitizeHex('#ff00aa')).toBe('#ff00aa');
    expect(sanitizeHex('red')).toBeNull();
  });

  it('stores only sanitized branding fields', () => {
    const json = brandingToJson({
      productName: '  Brand X  ',
      logoUrl: 'javascript:alert(1)',
      accentColor: '#AABBCC',
      supportEmail: 'Help@Brand.test',
      hidePlatformBadge: true,
    });
    expect(json.productName).toBe('Brand X');
    expect(json.logoUrl).toBeNull();
    expect(json.accentColor).toBe('#aabbcc');
    expect(json.supportEmail).toBe('help@brand.test');
  });
});
