import { NextRequest } from 'next/server';
import { saveContactMessage } from '@/lib/contact-store';
import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({
  applyRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => '198.51.100.24'),
}));
jest.mock('@/lib/contact-store', () => ({ saveContactMessage: jest.fn() }));

const mockSaveContactMessage = jest.mocked(saveContactMessage);

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.24',
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: '홍길동',
  email: 'engineer@example.com',
  subject: '버그 리포트',
  message: '계산 결과 화면에서 단위가 표시되지 않습니다.',
};

describe('POST /api/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveContactMessage.mockResolvedValue('contact-1');
  });

  test('validates the contact contract instead of accepting feedback-shaped data', async () => {
    const response = await POST(request({
      type: 'search',
      targetId: 'q-1',
      rating: 'up',
    }));

    expect(response.status).toBe(400);
    expect(mockSaveContactMessage).not.toHaveBeenCalled();
  });

  test('persists a valid inquiry and returns its receipt id', async () => {
    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockSaveContactMessage).toHaveBeenCalledWith(expect.objectContaining({
      ...validBody,
      ip: '198.51.100.24',
    }));
    expect(body.data).toEqual({ id: 'contact-1', stored: true });
  });

  test('does not report success when storage is unavailable', async () => {
    mockSaveContactMessage.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
  });

  test('rejects invalid email and oversized content', async () => {
    const invalidEmail = await POST(request({ ...validBody, email: 'not-an-email' }));
    const oversized = await POST(request({ ...validBody, message: 'x'.repeat(5001) }));

    expect(invalidEmail.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mockSaveContactMessage).not.toHaveBeenCalled();
  });
});
