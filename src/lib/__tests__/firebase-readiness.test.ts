/** Readiness is not authorization: only the SDK's settled user supplies tokens. */
const mockAuth = {
  currentUser: null as null | {
    uid: string; email: string; displayName: string; photoURL: null;
    providerData: Array<{ providerId: string }>;
    getIdToken: jest.Mock<Promise<string>, [boolean]>;
  },
  authStateReady: jest.fn<Promise<void>, []>(),
};
jest.mock('firebase/app', () => ({ getApps: () => [{}], getApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));
import { getCurrentUser, getIdToken } from '../firebase';

const oldEnvironment = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  domain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };
const user = () => ({ uid: 'fixture-user', email: 'test@example.invalid', displayName: 'Fixture', photoURL: null,
  providerData: [{ providerId: 'google.com' }], getIdToken: jest.fn<Promise<string>, [boolean]>().mockResolvedValue('synthetic-sdk-token') });
beforeAll(() => {
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fixture';
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'fixture.invalid';
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'fixture';
});
afterAll(() => {
  for (const [name, value] of [['NEXT_PUBLIC_FIREBASE_API_KEY', oldEnvironment.apiKey],
    ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', oldEnvironment.domain], ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', oldEnvironment.project]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
beforeEach(() => { mockAuth.currentUser = null; mockAuth.authStateReady.mockReset().mockResolvedValue(undefined); });

it('waits for initial SDK restoration before deciding there is no token', async () => {
  let release!: () => void;
  mockAuth.authStateReady.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
  let settled = false;
  const pending = getIdToken().finally(() => { settled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  mockAuth.currentUser = user();
  release();
  expect(await pending).toBe('synthetic-sdk-token');
  expect(mockAuth.currentUser.getIdToken).toHaveBeenCalledWith(false);
});
it('forwards forceRefresh only to the settled SDK user', async () => {
  mockAuth.authStateReady.mockImplementation(async () => { mockAuth.currentUser = user(); });
  expect(await getIdToken(true)).toBe('synthetic-sdk-token');
  expect(mockAuth.currentUser?.getIdToken).toHaveBeenCalledWith(true);
});
it('keeps a settled anonymous user anonymous instead of fabricating a token', async () => {
  expect(await getIdToken()).toBeNull();
  expect(await getCurrentUser()).toBeNull();
});
it('propagates SDK restoration failure rather than authorizing from stale state', async () => {
  mockAuth.currentUser = user();
  mockAuth.authStateReady.mockRejectedValue(new Error('restore failed'));
  await expect(getIdToken()).rejects.toThrow('restore failed');
  expect(mockAuth.currentUser.getIdToken).not.toHaveBeenCalled();
});
it('reads the restored user profile without exposing SDK tokens', async () => {
  mockAuth.authStateReady.mockImplementation(async () => { mockAuth.currentUser = user(); });
  expect(await getCurrentUser()).toEqual({ uid: 'fixture-user', email: 'test@example.invalid', displayName: 'Fixture', photoURL: null, provider: 'google.com' });
  expect(mockAuth.currentUser?.getIdToken).not.toHaveBeenCalled();
});
it('does not reuse the previous user after a sign-out', async () => {
  mockAuth.currentUser = user();
  expect(await getIdToken()).toBe('synthetic-sdk-token');
  mockAuth.currentUser = null;
  expect(await getIdToken()).toBeNull();
});
