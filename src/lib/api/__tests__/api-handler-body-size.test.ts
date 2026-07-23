import { NextRequest } from 'next/server';

import { withApiHandler } from '../api-handler';

describe('withApiHandler request body boundary', () => {
  test('rejects a body over the configured limit before invoking the handler', async () => {
    const handler = jest.fn(async (_req: NextRequest, ctx) => ctx.ok({ accepted: true }));
    const wrapped = withApiHandler(
      { rateLimit: null, checkOrigin: false, maxBodySize: 8 },
      handler,
    );
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'too-large' }),
    });

    const response = await wrapped(request);

    expect(response.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  test('preserves a valid body for the wrapped handler', async () => {
    const handler = jest.fn(async (req: NextRequest, ctx) => {
      const body = await req.json();
      return ctx.ok(body);
    });
    const wrapped = withApiHandler(
      { rateLimit: null, checkOrigin: false, maxBodySize: 64 },
      handler,
    );
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    });

    const response = await wrapped(request);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { ok: true },
    });
  });
});
