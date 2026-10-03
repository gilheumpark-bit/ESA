import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-id-token';
import { createNotification, markRead } from '@/lib/notifications';
import { PATCH, POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/firebase-id-token', () => ({ verifyIdToken: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
  getUserNotifications: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const mockVerifyIdToken = jest.mocked(verifyIdToken);
const mockCreateNotification = jest.mocked(createNotification);
const mockMarkRead = jest.mocked(markRead);

function request(method: 'POST' | 'PATCH', body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/notifications', {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('/api/notifications ownership boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-a' } as never);
    mockMarkRead.mockResolvedValue(true as never);
  });

  test('binds a single-notification update to the authenticated owner', async () => {
    const response = await PATCH(request('PATCH', {
      userId: 'user-a',
      notificationId: 'notif-target',
    }));

    expect(response.status).toBe(200);
    expect(mockMarkRead).toHaveBeenCalledWith('notif-target', 'user-a');
  });

  test('returns not found when the notification does not belong to the caller', async () => {
    mockMarkRead.mockResolvedValue(false as never);

    const response = await PATCH(request('PATCH', {
      userId: 'user-a',
      notificationId: 'notif-owned-by-b',
    }));

    expect(response.status).toBe(404);
  });

  test('prevents an authenticated client from creating a notification for another user', async () => {
    const response = await POST(request('POST', {
      userId: 'user-b',
      type: 'system',
      title: 'forged notice',
    }));

    expect(response.status).toBe(403);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  /**
   * 공유 시크릿 헤더로 로그인 없이 임의 사용자 앞 알림을 만들 수 있는 길이 있었다.
   * 그 헤더를 보내는 호출자는 저장소 어디에도 없었다(서버 내부는 createNotification 을
   * 직접 부른다). 쓰는 곳 없는 우회로는 시크릿이 새는 날 그대로 공격면이 된다.
   */
  test('공유 시크릿 헤더는 로그인을 대신하지 못한다', async () => {
    const previous = process.env.INTERNAL_API_SECRET;
    const probe = randomUUID();
    process.env.INTERNAL_API_SECRET = probe;
    try {
      const response = await POST(new NextRequest('http://localhost:3000/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': probe,
        },
        body: JSON.stringify({ userId: 'user-b', type: 'system', title: 'forged notice' }),
      }));

      expect(response.status).toBe(401);
      expect(mockCreateNotification).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
      else process.env.INTERNAL_API_SECRET = previous;
    }
  });
});
