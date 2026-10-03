import { randomUUID } from 'node:crypto';
import { ensureUserProfile } from '@/lib/supabase';

const upsert = jest.fn(async (_profile: Record<string, unknown>, _options: unknown) => ({ error: null }));
const from = jest.fn(() => ({ upsert }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from })),
}));

/**
 * 관리자 화면의 「마지막 로그인」 열은 `users.last_sign_in` 을 읽는데, 그 값을 쓰는
 * 코드가 없어서 항상 비어 있었다(읽는 쪽만 있고 쓰는 쪽이 없는 열).
 *
 * 프로필 동기화는 본인 로그인 말고도 불린다 — 남에게 알림을 보낼 때, 프로젝트
 * 소유자를 확인할 때. 그 경로에서 시각을 찍으면 로그인하지 않은 사람이 방금
 * 로그인한 것처럼 보이므로, 본인 세션임을 밝힌 호출만 찍는다.
 */
describe('ensureUserProfile — 마지막 로그인 시각', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = randomUUID();
  });
  beforeEach(() => upsert.mockClear());

  test('본인 세션 호출은 last_sign_in 을 현재 시각으로 쓴다', async () => {
    const before = Date.now();
    await ensureUserProfile('firebase-a', 'a@example.com', { signedIn: true });

    const profile = upsert.mock.calls[0][0];
    expect(profile).toMatchObject({ id: 'firebase-a', email: 'a@example.com' });
    const stamped = Date.parse(String(profile.last_sign_in));
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });

  test('다른 사람의 프로필을 맞춰 두는 호출은 시각을 건드리지 않는다', async () => {
    await ensureUserProfile('firebase-b');

    expect(upsert.mock.calls[0][0]).toEqual({ id: 'firebase-b' });
  });
});
