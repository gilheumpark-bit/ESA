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

  // 200 경로(버그 사냥 커버리지 착시 수리): 구 테스트는 400 경계만 밟아 실제
  // runCalcPipeline·검증 엔진이 0회 실행됐다 — 유효 입력 1건으로 200 사슬을 발화.
  it('유효 입력은 200으로 검토 리포트를 반환한다 (파이프라인·검증엔진 실발화)', async () => {
    const response = await POST(request({
      voltage_V: 380,
      totalLength_m: 50,
      cableSize_sq: 25,
      maxVoltageDropPercent: 3,
      phases: 3,
      conductor: 'Cu',
      insulation: 'XLPE',
      installation: 'conduit',
      current_A: 100,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
