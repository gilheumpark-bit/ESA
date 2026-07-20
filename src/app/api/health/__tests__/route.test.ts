import { NextRequest } from 'next/server';

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HEALTHCHECK_TOKEN: 'health-secret',
      OPENAI_API_KEY: ['configured', 'provider', 'key'].join('-'),
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.WEAVIATE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('redacts dependency and asset details from unauthenticated callers', async () => {
    const response = await GET(new NextRequest('http://localhost/api/health'));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.status).toBe('degraded');
    expect(body.data.dependencies).toBeUndefined();
    expect(body.data.dataAssets).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('Key configured');
  });

  it('returns operational details only for the configured health token', async () => {
    const response = await GET(new NextRequest('http://localhost/api/health', {
      headers: { authorization: 'Bearer health-secret' },
    }));
    const body = await response.json();

    expect(body.data.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Supabase' }),
      expect.objectContaining({ name: 'AI:OpenAI', detail: 'Key configured' }),
    ]));
    expect(body.data.dataAssets).toEqual(expect.objectContaining({
      inspectionItems: expect.any(Number),
    }));
  });
});
