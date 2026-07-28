import { NextRequest } from 'next/server';
import { POST } from '../route';

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(async () => null),
  extractVerifiedUser: jest.fn(async () => null),
}));
jest.mock('@/lib/supabase', () => ({
  saveCalculation: jest.fn(),
  listUserCalculations: jest.fn(),
}));
// 실제 모듈을 쓰고 통과만 강제한다 — 부분 mock 은 빠진 export 가 있으면
// 라우트를 500 으로 떨어뜨려 이 검사가 무엇을 보는지 알 수 없게 만든다.
jest.mock('@/lib/rate-limit', () => ({
  ...jest.requireActual('@/lib/rate-limit'),
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })),
}));

/**
 * **422 응답이 어느 칸이 문제인지 싣는가.**
 *
 * 계산 경로의 거부를 `CalcValidationError(field, …)` 로 바꾼 목적은 화면이
 * *그 칸*을 짚게 하는 것이다. 그런데 라우트가 `{code, message}` 만 싣고
 * `err.field` 를 버리고 있었다 — 계산기는 어느 칸인지 알고, 화면은 그 칸을
 * 표시할 준비가 돼 있는데, **가운데서 끊겨** 아무 칸도 안 짚었다
 * (2026-07-28 독립 심사 백엔드 좌석).
 *
 * 이 검사는 소스를 훑지 않는다. 라우트 핸들러를 실제로 호출해 **응답 본문**을
 * 본다 — 응답 스키마에서 `field` 를 빼면 여기서 깨진다.
 */

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/calculate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/calculate — 오류 계약', () => {
  it('입력이 틀리면 422 이고 어느 칸인지 싣는다', async () => {
    const res = await post({ calculatorId: 'max-demand', inputs: { loads: [] } });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('ESVA-4010');
    expect(body.error.field).toBe('loads');
  });

  /**
   * 칸 이름이 폼에 있는 것이어야 화면이 짚는다. `emergency-generator` 가
   * `'loads'` 를 던지고 폼은 `emergencyLoads` 였던 자리다.
   */
  it('emergency-generator 는 폼 칸 이름을 싣는다', async () => {
    const res = await post({ calculatorId: 'emergency-generator', inputs: { emergencyLoads: [] } });
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe('emergencyLoads');
  });

  /**
   * 표 계층의 내부 이름(`size`)이 아니라 이 폼의 이름(`cableSize`)이어야 한다.
   * 그리고 메시지에 내부 표 키(`Cu_XLPE_freeAir` 꼴)가 실리면 안 된다.
   */
  it('ampacity-compare 는 폼 칸 이름을 싣고 내부 키를 흘리지 않는다', async () => {
    const res = await post({
      calculatorId: 'ampacity-compare',
      inputs: { cableSize: 2.5, conductor: 'Al', insulation: 'PVC', ambientTemp: 30 },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.field).toBe('cableSize');
    expect(body.error.message).not.toMatch(/_(XLPE|PVC|MI)_/);
  });

  /** 정상 입력이 막히면 수리가 아니라 회귀다(§2.11). */
  it('정상 입력은 200 이다', async () => {
    const res = await post({
      calculatorId: 'max-demand',
      inputs: {
        loads: [{ name: 'A', ratedPower: 10, demandFactor: 0.8 }],
        diversityFactor: 1.2,
      },
    });
    expect(res.status).toBe(200);
  });
});
