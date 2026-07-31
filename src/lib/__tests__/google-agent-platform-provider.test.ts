import { getProvider, isCatalogModel } from '@/lib/ai-providers';
import { getAvailableProviders, resolveProviderKey, validateKeyFormat } from '@/lib/server-ai';

describe('Google Agent Platform provider contract', () => {
  const previousKey = process.env.GOOGLE_VERTEX_API_KEY;
  const deploymentKey = ['agent', 'platform', 'test', 'key', '123456'].join('-');
  const plausibleGoogleKey = ['AI', 'zaSy', 'AgentPlatformKey', '1234567890'].join('');

  afterEach(() => {
    if (previousKey === undefined) delete process.env.GOOGLE_VERTEX_API_KEY;
    else process.env.GOOGLE_VERTEX_API_KEY = previousKey;
  });

  it('keeps Agent Platform separate from the Gemini Developer API catalog', () => {
    const provider = getProvider('google-agent-platform');

    expect(provider).toMatchObject({
      id: 'google-agent-platform',
      name: 'Google Agent Platform (Cloud 크레딧)',
      defaultModel: 'gemini-3.6-flash',
    });
    expect(provider?.models.map((model) => model.id)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);
    expect(isCatalogModel('google-agent-platform', 'gemini-3.6-flash')).toBe(true);
  });

  it('resolves the deployment key only from GOOGLE_VERTEX_API_KEY', () => {
    process.env.GOOGLE_VERTEX_API_KEY = deploymentKey;

    expect(resolveProviderKey('google-agent-platform')).toEqual({
      key: deploymentKey,
      source: 'env',
    });
    expect(getAvailableProviders()).toContainEqual({
      id: 'google-agent-platform',
      name: 'Google Agent Platform (Cloud 크레딧)',
      available: true,
      source: 'env',
    });
  });

  it('accepts a plausible Google Cloud API key format', () => {
    expect(validateKeyFormat('google-agent-platform', plausibleGoogleKey)).toBe(true);
    expect(validateKeyFormat('google-agent-platform', 'short')).toBe(false);
  });
});
