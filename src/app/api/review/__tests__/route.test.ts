import { NextRequest } from 'next/server';

import { POST } from '@/app/api/review/route';

function request(params: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ params }),
  });
}

describe('POST /api/review input boundary', () => {
  it('fails closed instead of inventing cable size, current, phases, and material defaults', async () => {
    const response = await POST(request({ voltage_V: 380, totalLength_m: 50 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('ESVA-4001');
    expect(body.error.message).toContain('필수');
  });

  it('rejects non-physical numeric ranges before the review pipeline runs', async () => {
    const response = await POST(request({
      voltage_V: -380,
      totalLength_m: 0,
      cableSize_sq: -16,
      current_A: -10,
      phases: 2,
      conductor: 'steel',
      insulation: 'paper',
      installation: 'unknown',
    }));

    expect(response.status).toBe(400);
  });
});
