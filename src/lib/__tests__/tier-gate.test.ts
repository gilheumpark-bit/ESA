import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkCalcAccess, isTierAtLeast, OPEN_BETA, type Tier, type CalcDifficulty } from '@/lib/tier-gate';

/**
 * 요금제 접근 통제를 잠근다.
 *
 * 무게이트 방어 32 곳 중 하나였다. 이 게이트가 한쪽으로 틀리면 유료 기능이
 * 새고, 반대로 틀리면 돈 낸 사용자가 막힌다 — 둘 다 실물 손해다.
 *
 * 배선은 건전하다(2026-07-28 확인): `/api/calculate` 가 요금제를
 * **클라이언트 입력이 아니라** `extractVerifiedUserId(request)` →
 * `getUserTier(userId)` 로 서버에서 조회한다. 요금제를 요청 본문에 실어
 * 보내는 구조였으면 우회가 자명했을 것이다. 실측으로 12 개 계산기가
 * 403 을 내는 것도 확인했다.
 *
 * 여기서 잠그는 것은 **판정 규칙 자체**다.
 */

// OPEN_BETA 는 모듈 로드 시점 환경변수라 테스트에서 바꿀 수 없다.
// 켜져 있으면 아래 거부 단언이 전부 무의미해지므로 먼저 확인한다.
describe('요금제 접근 통제', () => {
  it('이 테스트는 OPEN_BETA 가 꺼진 상태를 전제한다', () => {
    expect(OPEN_BETA).toBe(false);
  });

  it.each<[Tier, CalcDifficulty]>([
    ['free', 'basic'],
    ['free', 'intermediate'],
    ['pro', 'advanced'],
    ['pro', 'expert'],
    ['team', 'expert'],
    ['enterprise', 'expert'],
  ])('%s 는 %s 계산기를 쓸 수 있다', (tier, difficulty) => {
    expect(checkCalcAccess(tier, difficulty).allowed).toBe(true);
  });

  /**
   * 이 거부는 **두 겹**이다(변이로 확인, 2026-07-28):
   *   ① `DIFFICULTY_MIN_TIER.advanced = 'pro'` — 난이도별 최소 등급
   *   ② free 등급의 `advancedCalc: false` — 기능 플래그
   * 하나만 열면 나머지가 막고, **둘 다 열어야 뚫린다.**
   *
   * 그래서 이 단언은 특정 장치가 아니라 **결과**를 본다 — 한쪽 구현이
   * 바뀌어도 결과가 같으면 통과해야 하고, 실제로 유료 기능이 새는
   * 순간에만 빨개져야 한다.
   */
  it.each<[Tier, CalcDifficulty]>([
    ['free', 'advanced'],
    ['free', 'expert'],
  ])('%s 는 %s 계산기를 못 쓴다 — 새면 유료 기능이 공짜가 된다', (tier, difficulty) => {
    const r = checkCalcAccess(tier, difficulty);
    expect(r.allowed).toBe(false);
    expect(r.requiredTier).toBe('pro');
    expect(r.reason).toBeTruthy();
  });

  /**
   * **모르는 값은 거부한다.** 요금제 문자열이 오타나 신설 등급이면
   * `TIER_ORDER[x]` 가 undefined 가 되는데, 비교 결과가 false 라 거부로
   * 떨어진다 — 통과로 떨어졌으면 오타 하나가 전 기능 개방이었다.
   */
  it('모르는 요금제는 거부한다 (fail-closed)', () => {
    expect(checkCalcAccess('platinum' as Tier, 'advanced').allowed).toBe(false);
    expect(checkCalcAccess('' as Tier, 'advanced').allowed).toBe(false);
  });

  it('모르는 난이도도 거부한다 (fail-closed)', () => {
    expect(checkCalcAccess('free', 'impossible' as CalcDifficulty).allowed).toBe(false);
  });

  it('거부 사유가 사용자에게 무엇을 하라고 말한다', () => {
    const ko = checkCalcAccess('free', 'advanced', 'ko').reason ?? '';
    const en = checkCalcAccess('free', 'advanced', 'en').reason ?? '';
    expect(ko).toMatch(/Pro|업그레이드|요금제/);
    expect(en).toMatch(/Pro|upgrade|plan/i);
  });
});

describe('요금제 서열', () => {
  it.each<[Tier, Tier, boolean]>([
    ['free', 'free', true],
    ['free', 'pro', false],
    ['pro', 'free', true],
    ['pro', 'pro', true],
    ['team', 'pro', true],
    ['enterprise', 'team', true],
    ['pro', 'team', false],
    ['team', 'enterprise', false],
  ])('%s >= %s 는 %s', (current, required, expected) => {
    expect(isTierAtLeast(current, required)).toBe(expected);
  });
});

/**
 * **표면을 좁게 유지한다.**
 *
 * 2026-07-29 실측에서 이 모듈의 export 8 개 중 5 개가 호출처 0 이었다
 * (`checkFeatureAccess`·`checkDailyUsage`·`formatLimit`·`getTierDisplayName`·
 * `ALL_TIERS`). 요금제가 아직 안 팔리니 자연스러운 일이지만, "다 있다" 로
 * 읽히는 게 문제였다 — 특히 `checkDailyUsage` 는 사용량을 호출자가 주는
 * 서명이라 정작 어려운 부분(일일 카운터 저장소)이 없는 채로 완성처럼 보였다.
 *
 * 이 검사는 다시 늘어나면 깨진다. 새 export 를 더할 땐 **호출처와 함께** 더하고
 * 여기 이름을 적는다. 잔여 선언은 `docs/DORMANT_MANIFEST.md`.
 */
describe('요금제 모듈 표면', () => {
  it('쓰이는 것만 내보낸다', async () => {
    const mod = await import('@/lib/tier-gate');
    expect(Object.keys(mod).sort()).toEqual([
      'OPEN_BETA',
      'checkCalcAccess',
      'isTierAtLeast',
    ]);
  });

  /** 일일 한도는 표에 남아 있다 — 지운 것은 읽던 함수지 제품 결정이 아니다. */
  it('일일 한도 숫자는 표에 남아 있고, 그것을 집행하는 곳은 없다', () => {
    const src = readFileSync(join(__dirname, '..', 'tier-gate.ts'), 'utf8');
    expect(src).toMatch(/calcPerDay:\s*10/);
    expect(src).toMatch(/aiChatPerDay:\s*5/);
    expect(src).not.toMatch(/function checkDailyUsage/);
  });
});
