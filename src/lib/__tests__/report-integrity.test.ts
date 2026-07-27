import { verifyReportIntegrity } from '@/lib/report-integrity';
import { hashCanonicalValue } from '@/engine/receipt/receipt-hash';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

/**
 * 보고서 무결성 검증을 잠근다.
 *
 * 무게이트 방어 32 곳 중 하나였는데, 이건 **읽기 게이트**이기도 하다 —
 * `report-store.ts` 가 검증 실패한 보고서를 아예 내주지 않는다. 여기가
 * 항상 true 를 내면 변조된 보고서가 그대로 나가고, 항상 false 를 내면
 * 멀쩡한 보고서가 사라진다.
 *
 * 영수증 해시(10 필드만 봉인)와 달리 이쪽은 **`hash` 를 뺀 보고서 전체**를
 * 덮는다. 그 차이를 여기서 못박는다.
 *
 * JSON 왕복도 본다. 저장·전송을 거치면 `undefined` 필드가 사라지는데,
 * 정규화가 그걸 처음부터 빼고 세지 않으면 저장하자마자 자기 보고서가
 * 검증 실패한다.
 *
 * 변이로 두 방어의 몫을 갈라 봤다(2026-07-28):
 *   ① 해시 형식 검사(`/^[a-f0-9]{64}$/`) 제거 → **13 전부 통과**.
 *      형식이 깨진 해시는 어차피 재계산값과 안 맞아 비교에서 걸린다.
 *      즉 이 검사는 조기 탈출이지 유일한 방어가 아니다.
 *   ② 비교를 `return true` 로 바꾸기 → **3 RED**(본문 변조·판정 뒤집기·
 *      필드 증감). 내용 변조를 잡는 것은 비교뿐이다.
 * 형식 검사만 남기고 비교를 잃으면 "해시가 그럴듯하면 통과" 가 된다 —
 * 그래서 ② 쪽 단언이 이 파일의 무게중심이다.
 */

async function makeReport(over: Record<string, unknown> = {}): Promise<ESVAVerifiedReport> {
  const claim = {
    reportId: 'rpt-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    summary: '검토 완료',
    verdict: 'PASS',
    ...over,
  };
  const hash = await hashCanonicalValue(claim);
  return { ...claim, hash } as unknown as ESVAVerifiedReport;
}

describe('보고서 무결성', () => {
  it('정상 보고서는 통과한다', async () => {
    await expect(verifyReportIntegrity(await makeReport())).resolves.toBe(true);
  });

  it('본문을 한 글자만 바꿔도 실패한다 — 안 깨지면 봉인이 아니다', async () => {
    const r = await makeReport();
    // `summary` 는 실제 타입에서 객체다 — 여기서는 값이 바뀌었는지만 보므로
    // 형태를 맞추지 않고 unknown 을 거쳐 넣는다.
    const tampered = { ...r, summary: '검토 완료.' } as unknown as ESVAVerifiedReport;
    await expect(verifyReportIntegrity(tampered)).resolves.toBe(false);
  });

  it('판정을 뒤집으면 실패한다', async () => {
    const r = await makeReport({ verdict: 'FAIL' });
    const flipped = { ...r, verdict: 'PASS' } as unknown as ESVAVerifiedReport;
    await expect(verifyReportIntegrity(flipped)).resolves.toBe(false);
  });

  it('필드를 더하거나 빼도 실패한다 — 영수증 해시와 달리 전체를 덮는다', async () => {
    const r = await makeReport();
    await expect(verifyReportIntegrity({ ...r, extra: 1 } as unknown as ESVAVerifiedReport)).resolves.toBe(false);
    const { summary: _dropped, ...without } = r as unknown as Record<string, unknown>;
    await expect(verifyReportIntegrity(without as unknown as ESVAVerifiedReport)).resolves.toBe(false);
  });

  it.each([
    ['해시 없음', undefined],
    ['빈 문자열', ''],
    ['길이 부족', 'a'.repeat(63)],
    ['길이 초과', 'a'.repeat(65)],
    ['16진수 아님', 'z'.repeat(64)],
    ['대문자', 'A'.repeat(64)],
  ])('해시 형식이 %s 이면 거부한다', async (_label, hash) => {
    const r = await makeReport();
    await expect(
      verifyReportIntegrity({ ...r, hash } as unknown as ESVAVerifiedReport),
    ).resolves.toBe(false);
  });

  it('보고서 자체가 없으면 거부한다 (fail-closed)', async () => {
    await expect(verifyReportIntegrity(null as unknown as ESVAVerifiedReport)).resolves.toBe(false);
    await expect(verifyReportIntegrity(undefined as unknown as ESVAVerifiedReport)).resolves.toBe(false);
  });

  /**
   * 저장·전송을 거치면 `undefined` 필드가 사라진다. 정규화가 그걸 처음부터
   * 빼고 세지 않으면 **저장하자마자 자기 보고서가 검증 실패**한다 —
   * 사용자에겐 "보고서를 찾을 수 없거나 무결성 검증에 실패했습니다" 로 보인다.
   */
  it('JSON 왕복 후에도 통과한다 — undefined 필드가 사라져도', async () => {
    const r = await makeReport({ note: undefined });
    const roundTripped = JSON.parse(JSON.stringify(r)) as ESVAVerifiedReport;
    await expect(verifyReportIntegrity(roundTripped)).resolves.toBe(true);
  });

  it('키 순서가 달라도 통과한다 — 정규화가 정렬한다', async () => {
    const r = await makeReport();
    const reordered = Object.fromEntries(
      Object.entries(r as unknown as Record<string, unknown>).reverse(),
    ) as unknown as ESVAVerifiedReport;
    await expect(verifyReportIntegrity(reordered)).resolves.toBe(true);
  });
});
