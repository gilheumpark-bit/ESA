import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { saveCalculation } from '@/lib/supabase';
import { POST } from '../route';

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
  extractVerifiedUser: jest.fn(async () => null),
}));
jest.mock('@/lib/supabase', () => ({
  saveCalculation: jest.fn(),
  listUserCalculations: jest.fn(),
  getUserTier: jest.fn(async () => 'enterprise'),
}));
jest.mock('@/lib/rate-limit', () => ({
  ...jest.requireActual('@/lib/rate-limit'),
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })),
}));

const mockUser = jest.mocked(extractVerifiedUserId);
const mockSave = jest.mocked(saveCalculation);

/**
 * 로그인 사용자의 계산이 계정에 저장됐는지를 응답이 말하는가.
 *
 * 전에는 저장이 실패해도 `success:true` 와 영수증만 돌려줬다. 화면은 영수증을
 * 탭 저장소에 넣어 보여 주므로 저장된 것처럼 보이다가, 탭을 닫으면 이력·영수증
 * 링크·내보내기가 전부 404 가 됐다. 계산 자체를 실패시키지는 않는다(계산은
 * 맞게 끝났다) — 대신 저장 여부를 따로 싣는다.
 */
function calculate(): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/calculate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify({
      calculatorId: 'single-phase-power',
      inputs: { voltage: 220, current: 10, powerFactor: 0.85 },
    }),
  }));
}

describe('POST /api/calculate — 저장 여부', () => {
  beforeEach(() => {
    mockUser.mockReset();
    mockSave.mockReset();
  });

  it('저장에 성공하면 persisted:true', async () => {
    mockUser.mockResolvedValue('firebase-user-a');
    mockSave.mockResolvedValue(undefined as never);

    const res = await calculate();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.receipt.id).toBeTruthy();
    expect(body.data.persisted).toBe(true);
  });

  it('저장에 실패하면 계산은 돌려주되 persisted:false', async () => {
    mockUser.mockResolvedValue('firebase-user-a');
    mockSave.mockRejectedValue(new Error('store unavailable'));

    const res = await calculate();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.receipt.id).toBeTruthy();
    expect(body.data.persisted).toBe(false);
  });

  it('비로그인은 저장 대상이 아니므로 persisted:null 이고 저장을 시도하지 않는다', async () => {
    mockUser.mockResolvedValue(null);

    const res = await calculate();
    expect(res.status).toBe(200);
    expect((await res.json()).data.persisted).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
