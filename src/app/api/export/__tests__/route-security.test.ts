import { NextRequest } from 'next/server';
import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn(async () => null) }));

describe('POST /api/export security boundary', () => {
  test('rejects a cross-origin browser request before parsing or exporting', async () => {
    const request = new NextRequest('http://localhost:3000/api/export', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'localhost:3000',
      },
      body: '{}',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'ESVA-9001: Invalid origin' });
  });
});
