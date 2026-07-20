import { verifyIdToken } from '@/lib/firebase-id-token';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

jest.mock('@/lib/firebase-id-token', () => ({ verifyIdToken: jest.fn() }));

const mockVerify = jest.mocked(verifyIdToken);

describe('extractVerifiedUserId', () => {
  test('never trusts an unsigned JWT payload in development', async () => {
    const replacedNodeEnv = jest.replaceProperty(process.env, 'NODE_ENV', 'development');
    mockVerify.mockRejectedValue(new Error('bad signature'));
    const payload = btoa(JSON.stringify({ sub: 'attacker-user' }));
    const request = new Request('http://localhost/api/private', {
      headers: { Authorization: `Bearer header.${payload}.forged` },
    });

    try {
      expect(process.env.NODE_ENV).toBe('development');
      await expect(extractVerifiedUserId(request)).resolves.toBeNull();
    } finally {
      replacedNodeEnv.restore();
    }
  });
});
