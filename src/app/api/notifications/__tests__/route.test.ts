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
});
