import { NextRequest } from 'next/server';

import { POST } from '../route';

describe('POST /api/rules/validate body boundary', () => {
  test('rejects an oversized body before the route materializes text', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/rules/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ payload: '가'.repeat(400_000) }),
    }));

    expect(response.status).toBe(413);
  });
});
