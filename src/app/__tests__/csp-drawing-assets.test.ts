import nextConfig from '../../../next.config';

describe('drawing source CSP contract', () => {
  it('allows browser-local blob URLs used by the source-linked overlay', async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === '/(.*)');
    const policy = globalRule?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(policy).toBeDefined();
    expect(policy?.split('; ').find((directive) => directive.startsWith('img-src ')))
      .toContain('blob:');
  });

  it('blocks plugin objects and constrains document base/form targets', async () => {
    const rules = await nextConfig.headers?.();
    const policy = rules?.find((rule) => rule.source === '/(.*)')?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });
});
