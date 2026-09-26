/** Verifier contract tests. jose is mocked; these are not live Firebase logins. */
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { verifyIdToken } from '../firebase-id-token';

jest.mock('jose', () => ({ jwtVerify: jest.fn(), createRemoteJWKSet: jest.fn(() => 'jwks') }));
const verify = jest.mocked(jwtVerify);
const originalProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const now = Math.floor(Date.now() / 1000);
const valid = { sub: 'owner', iat: now - 10, auth_time: now - 20, exp: now + 3600 };
function payload(value: Record<string, unknown>) {
  verify.mockResolvedValue({ payload: value, protectedHeader: { alg: 'RS256' } } as Awaited<ReturnType<typeof jwtVerify>>);
}
beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
  verify.mockReset();
  payload(valid);
});
afterAll(() => {
  if (originalProject === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = originalProject;
});

test('pins Google keys, issuer, audience, algorithm and mandatory claims', async () => {
  expect(createRemoteJWKSet).toHaveBeenCalledWith(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  await expect(verifyIdToken('signed-token')).resolves.toEqual({ uid: 'owner' });
  expect(verify).toHaveBeenCalledWith('signed-token', 'jwks', {
    issuer: 'https://securetoken.google.com/test-project', audience: 'test-project',
    algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
  });
});
test.each(['', '   '])('rejects empty token %j without cryptographic work', async (token) => {
  await expect(verifyIdToken(token)).resolves.toBeNull();
  expect(verify).not.toHaveBeenCalled();
});
test('missing project fails closed before network work', async () => {
  delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  await expect(verifyIdToken('token')).resolves.toBeNull();
  expect(verify).not.toHaveBeenCalled();
});
test('trims project configuration', async () => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = ' test-project ';
  await verifyIdToken('token');
  expect(verify).toHaveBeenCalledWith('token', 'jwks', expect.objectContaining({ audience: 'test-project' }));
});
test.each(['signature', 'expired', 'wrong audience', 'unknown key', 'network error'])('verification failure: %s', async (reason) => {
  verify.mockRejectedValue(new Error(reason));
  await expect(verifyIdToken('invalid')).resolves.toBeNull();
});
test.each(['', undefined, 42, 'x'.repeat(129)])('rejects invalid subject %j', async (sub) => {
  payload({ ...valid, sub });
  await expect(verifyIdToken('token')).resolves.toBeNull();
});
test.each([undefined, '1234', NaN, Infinity, -1, now + 3600])('rejects invalid issued/authentication time %j', async (time) => {
  payload({ ...valid, iat: time });
  await expect(verifyIdToken('token')).resolves.toBeNull();
  payload({ ...valid, auth_time: time });
  await expect(verifyIdToken('token')).resolves.toBeNull();
});
test('optional identity fields must have the expected types', async () => {
  payload({ ...valid, email: 'test@example.invalid', email_verified: true });
  await expect(verifyIdToken('token')).resolves.toEqual({ uid: 'owner', email: 'test@example.invalid', emailVerified: true });
  payload({ ...valid, email: 1, email_verified: 'true' });
  await expect(verifyIdToken('token')).resolves.toEqual({ uid: 'owner' });
});
