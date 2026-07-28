import { NextRequest } from 'next/server';

import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { isFeatureEnabledServer } from '@/lib/feature-flags';
import { loadCalculation, getSupabaseAdmin } from '@/lib/supabase';
import { GET } from '../route';

/**
 * `GET /api/notarize?receiptId=…` — 영수증 행이 들고 있는 증명 정보를
 * **증명 레지스트리와 맞춰 본다.**
 *
 * 이 검사가 무엇을 실제로 밟는지(§2.2): `verifyProof` 를 가짜로 바꾸지
 * 않는다. 막는 것은 **DB 경계 하나**(`getSupabaseAdmin`)뿐이고, CID·txHash
 * 비교는 실물이 돈다. `verifyProof` 를 mock 하면 초록이 뜨지만 대조가
 * 실제로 되는지는 아무것도 말해 주지 않는다.
 *
 * 대조가 자기 대조가 아닌 근거: 제시본은 **영수증 행**(`metadata.ipfsCid`·
 * `proofRegistryRecordId`)이고 대조본은 `timestamp_proofs` 표다. 둘은 등록
 * 시점에 따로 쓰였다. 레지스트리에서 꺼낸 것을 레지스트리와 맞추면 언제나
 * 통과한다(§2.3) — 그래서 아래 ③ 이 성립한다.
 */

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/feature-flags', () => ({ isFeatureEnabledServer: jest.fn(() => true) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  loadCalculation: jest.fn(),
  getSupabaseAdmin: jest.fn(),
}));

const OWNER = 'user-owner';
const HASH = 'a'.repeat(64);

/** 등록을 마친 영수증 행. metadata 가 제시본이다. */
function registeredRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: OWNER,
    receipt_hash: HASH,
    metadata: {
      receiptHash: HASH,
      ipfsCid: 'bafyREAL',
      proofRegistryRecordId: 'row-1',
      proofRecordedAt: '2026-07-28T00:00:00.000Z',
      proofRegistry: 'esa-registry',
      ...overrides,
    },
  };
}

/** `timestamp_proofs` 한 행을 돌려주는 최소 admin 스텁. */
function registryReturning(row: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  };
}

const REGISTRY_ROW = {
  id: 'row-1',
  block_number: 0,
  created_at: '2026-07-28T00:00:00.000Z',
  chain: 'esa-registry',
  receipt_hash: HASH,
  ipfs_cid: 'bafyREAL',
};

function req(query = '?receiptId=r-1'): NextRequest {
  return new NextRequest(`http://localhost/api/notarize${query}`, { method: 'GET' });
}

async function body(res: Response) {
  return (await res.json()) as { success: boolean; data?: Record<string, unknown> };
}

describe('GET /api/notarize — 등록 증명 대조', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isFeatureEnabledServer as jest.Mock).mockReturnValue(true);
    (extractVerifiedUserId as jest.Mock).mockResolvedValue(OWNER);
    (getSupabaseAdmin as jest.Mock).mockReturnValue(registryReturning(REGISTRY_ROW));
  });

  it('① 영수증 행과 레지스트리가 같으면 일치로 낸다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow());
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ registered: true, valid: true });
  });

  it('② 영수증 행의 CID 가 바뀌면 불일치로 잡는다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow({ ipfsCid: 'bafyTAMPERED' }));
    const res = await GET(req());
    const data = (await body(res)).data!;
    expect(data.registered).toBe(true);
    expect(data.valid).toBe(false);
    expect(String(data.reason)).toContain('CID');
  });

  it('③ txHash 가 바뀌어도 잡는다 — CID 만 보는 게 아니다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow({ proofRegistryRecordId: 'row-OTHER' }));
    const data = (await body(await GET(req()))).data!;
    expect(data.valid).toBe(false);
    expect(String(data.reason)).toMatch(/hash/i);
  });

  it('④ 레지스트리에 행이 없으면 일치라고 하지 않는다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow());
    (getSupabaseAdmin as jest.Mock).mockReturnValue(registryReturning(null));
    expect((await body(await GET(req()))).data).toMatchObject({ registered: true, valid: false });
  });

  /**
   * 등록한 적이 없는 것과 변조된 것은 다르다. 가르지 않으면 사용자는
   * 아무 일도 없었던 영수증을 보고 무언가 잘못됐다고 읽는다.
   */
  it.each([
    ['CID 없음', { ipfsCid: '' }],
    ['등록 ID 없음', { proofRegistryRecordId: '' }],
  ])('⑤ 등록한 적 없으면(%s) 변조가 아니라 미등록이다', async (_이름, missing) => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow(missing));
    const data = (await body(await GET(req()))).data!;
    expect(data.registered).toBe(false);
    expect(data.valid).toBeNull();
    expect(String(data.reason)).not.toMatch(/변조|불일치|tamper/i);
  });

  it('⑥ 남의 영수증은 있는지조차 알려주지 않는다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue({ ...registeredRow(), user_id: 'user-other' });
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect((await body(res)).success).toBe(false);
  });

  it('⑦ 로그인하지 않으면 401', async () => {
    (extractVerifiedUserId as jest.Mock).mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it('⑧ 플래그가 꺼져 있으면 404 — 꺼진 기능의 표면을 열지 않는다', async () => {
    (isFeatureEnabledServer as jest.Mock).mockReturnValue(false);
    expect((await GET(req())).status).toBe(404);
  });

  it('⑨ receiptId 가 없으면 400 이고 500 이 아니다', async () => {
    expect((await GET(req(''))).status).toBe(400);
  });

  it('⑩ 결과를 캐시에 남기지 않는다', async () => {
    (loadCalculation as jest.Mock).mockResolvedValue(registeredRow());
    expect((await GET(req())).headers.get('Cache-Control')).toContain('no-store');
  });
});
