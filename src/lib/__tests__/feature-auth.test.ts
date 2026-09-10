jest.mock('../firebase', () => ({ getIdToken: jest.fn() }));
import { getIdToken } from '../firebase';
import { featureAuthenticatedFetch } from '../feature-auth';
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); jest.mocked(getIdToken).mockResolvedValue('synthetic-not-a-real-token'); global.fetch = jest.fn(async () => Response.json({ success: true })); });
afterAll(() => { global.fetch = originalFetch; });
it.each(['/api/field/sos', '/api/field/complete'])('attaches the settled SDK token for %s', async (url) => {
  await featureAuthenticatedFetch(url, { method: 'POST', body: '{}' });
  expect(getIdToken).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const init = jest.mocked(global.fetch).mock.calls[0][1]!;
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer synthetic-not-a-real-token');
  expect(init.credentials).toBe('same-origin');
});
it('denies anonymous access without contacting the API', async () => {
  jest.mocked(getIdToken).mockResolvedValue(null);
  await expect(featureAuthenticatedFetch('/api/projects')).rejects.toMatchObject({ status: 401 }); expect(global.fetch).not.toHaveBeenCalled();
});
it('cannot forward credentials to an external host', async () => {
  await expect(featureAuthenticatedFetch('https://example.invalid/api/projects')).rejects.toThrow();
  expect(getIdToken).not.toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});
it('does not send a stale request after token restoration finishes', async () => {
  let release!: (value: string) => void;
  jest.mocked(getIdToken).mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const controller = new AbortController();
  const pending = featureAuthenticatedFetch('/api/field/complete', { signal: controller.signal });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort(); release('synthetic-not-a-real-token');
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(global.fetch).not.toHaveBeenCalled();
});
