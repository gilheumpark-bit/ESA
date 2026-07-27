import { buildCoverageLedger, assertCoverageAllowsComplete } from '../coverage-ledger';
import type { CoverageRegionRecord, RoleId } from '../types-v3';

/**
 * "커버리지 완료" 판정을 잠근다.
 *
 * 이 저장소에는 **커버리지 게이트가 상수 `complete: true` 로 고무도장을
 * 찍던** 과거가 있다. 지금 구현은 원장에서 파생하지만, 그 수리를 잠그는
 * 테스트가 없어 다음 리팩터에 조용히 되돌아갈 수 있었다
 * (무게이트 방어 32 곳 스윕에서 발견).
 *
 * 확인한 것 둘 — 둘 다 **결함 아님**:
 *   `allPlannedFinished` 라는 이름은 'planned' 만 보는 것처럼 읽히는데,
 *   실제 카운터는 `'planned' || 'running'` 을 함께 센다. 실행 중인 구역이
 *   남아 있으면 완료가 아니다. (이름만 보고 결함이라 부를 뻔했다.)
 *
 *   구역이 0 개면 모든 조건이 공허하게 만족돼 true 가 된다. 다만 호출부
 *   (`drawing-document-report`)가 `rolesOk`(필요 역할이 실제로 존재했는가)와
 *   페이지 완료 수를 함께 보므로 빈 원장만으로 COMPLETE 가 되지는 않는다.
 *   그 사실을 아래에 명시해 둔다 — 호출부 조건이 사라지면 여기가 통과시킨다.
 */

function region(over: Partial<CoverageRegionRecord> = {}): CoverageRegionRecord {
  return {
    regionId: 'r1',
    pageIndex: 0,
    kind: 'full-page',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    status: 'complete',
    requiredRoles: [],
    roleCalls: {},
    ...over,
  } as CoverageRegionRecord;
}

const ROLE = 'symbol' as RoleId;

describe('커버리지 완료 판정', () => {
  it('모든 구역이 끝났고 실패·미해결 재스캔이 없으면 완료다', () => {
    const l = buildCoverageLedger([region({ regionId: 'a' }), region({ regionId: 'b' })], [ROLE], 0);
    expect(assertCoverageAllowsComplete(l)).toBe(true);
  });

  it('계획 상태 구역이 남아 있으면 완료가 아니다', () => {
    const l = buildCoverageLedger([region(), region({ regionId: 'b', status: 'planned' })], [ROLE], 0);
    expect(assertCoverageAllowsComplete(l)).toBe(false);
  });

  /**
   * 이름이 `allPlannedFinished` 라 'running' 을 놓칠 것처럼 보이지만
   * 카운터가 함께 센다. 이 단언이 그 사실을 지킨다 — 카운터에서
   * `|| 'running'` 이 빠지면 **작업 중인데 완료로 보고**하게 된다.
   */
  it('실행 중 구역이 남아 있으면 완료가 아니다 — 이름과 달리 running 도 센다', () => {
    const l = buildCoverageLedger([region(), region({ regionId: 'b', status: 'running' })], [ROLE], 0);
    expect(assertCoverageAllowsComplete(l)).toBe(false);
  });

  it('실패한 구역이 있으면 완료가 아니다', () => {
    const l = buildCoverageLedger([region(), region({ regionId: 'b', status: 'failed' })], [ROLE], 0);
    expect(assertCoverageAllowsComplete(l)).toBe(false);
  });

  it('미해결 재스캔이 남아 있으면 완료가 아니다', () => {
    const l = buildCoverageLedger([region()], [ROLE], 1);
    expect(assertCoverageAllowsComplete(l)).toBe(false);
  });

  it('의도적으로 빈 구역(skipped-empty)은 완료를 막지 않는다', () => {
    const l = buildCoverageLedger([region({ status: 'skipped-empty' })], [ROLE], 0);
    expect(assertCoverageAllowsComplete(l)).toBe(true);
  });

  /**
   * **공허 통과를 사실로 기록한다.** 결함을 고정하는 게 아니라, 이 함수
   * 하나로는 "아무것도 계획되지 않음" 과 "전부 끝남" 을 구분하지 못한다는
   * 것을 남긴다. 호출부의 `rolesOk`·페이지 수 조건이 그 구분을 맡는다.
   */
  it('구역이 0 개면 공허하게 통과한다 — 호출부가 rolesOk 로 보완한다', () => {
    expect(assertCoverageAllowsComplete(buildCoverageLedger([], [], 0))).toBe(true);
  });

  it('역할 호출이 전부 실패한 구역은 failed 로 떨어져 완료를 막는다', () => {
    const l = buildCoverageLedger([
      region({
        requiredRoles: [ROLE],
        roleCalls: { [ROLE]: [{ callId: 'c1', success: false }] },
        status: 'planned',
      }),
    ], [ROLE], 0);
    // buildCoverageLedger 는 status 를 다시 파생하지 않고 받은 값을 쓴다 —
    // 파생은 attachRoleCall 경로에서 일어난다. 여기서는 planned 라 미완이다.
    expect(assertCoverageAllowsComplete(l)).toBe(false);
  });
});
