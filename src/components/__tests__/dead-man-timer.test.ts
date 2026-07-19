import { computeDeadManStage } from '@/components/DeadManSwitch';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — 데드맨 스위치가 백그라운드에서 정지하던 결함
//
// 타이머가 requestAnimationFrame 루프였다. 브라우저는 숨겨진 탭에서 rAF를
// 완전히 정지시키므로, 휴대폰을 주머니에 넣으면 감시가 멈추고 작업자가
// 쓰러져도 SOS 단계로 넘어가지 않았다.
//
// 핵심 불변식: 단계는 "tick이 몇 번 돌았는가"가 아니라 "벽시계로 얼마나
// 지났는가"만으로 결정되어야 한다. 그래야 백그라운드에서 tick이 한 번도
// 안 돌았더라도 복귀 즉시 올바른 단계가 나온다.
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  intervalMs: 30 * 60_000, // 30분
  warn1Multiplier: 1,
  warn2Multiplier: 1.5,
  sosMultiplier: 2,
};

const INTERVAL = CONFIG.intervalMs;

describe('computeDeadManStage — 벽시계 경과만으로 단계 판정', () => {
  test('경과 0이면 active', () => {
    expect(computeDeadManStage(0, CONFIG).stage).toBe('active');
  });

  test('1주기 직전까지 active를 유지한다', () => {
    expect(computeDeadManStage(INTERVAL - 1000, CONFIG).stage).toBe('active');
  });

  test('1주기 경과 시 warn1', () => {
    expect(computeDeadManStage(INTERVAL + 1000, CONFIG).stage).toBe('warn1');
  });

  test('1.5주기 경과 시 warn2', () => {
    expect(computeDeadManStage(INTERVAL * 1.6, CONFIG).stage).toBe('warn2');
  });

  test('2주기 경과 시 sos', () => {
    expect(computeDeadManStage(INTERVAL * 2 + 1000, CONFIG).stage).toBe('sos');
  });

  test('백그라운드로 오래 있다 복귀해도 경과시간만으로 sos를 판정한다', () => {
    // rAF가 멈춰 tick이 한 번도 안 돌았던 상황을 모사한다.
    // 복귀 시점의 벽시계 경과만으로 sos가 나와야 한다.
    expect(computeDeadManStage(INTERVAL * 5, CONFIG).stage).toBe('sos');
    expect(computeDeadManStage(INTERVAL * 100, CONFIG).stage).toBe('sos');
  });

  test('sos 단계의 progress는 1, 남은 시간은 0', () => {
    const r = computeDeadManStage(INTERVAL * 3, CONFIG);
    expect(r.progress).toBe(1);
    expect(r.nextDeadlineMs).toBe(0);
  });

  test('active 단계는 다음 마감까지 남은 시간을 준다', () => {
    const r = computeDeadManStage(INTERVAL / 2, CONFIG);
    expect(r.nextDeadlineMs).toBeGreaterThan(0);
    expect(r.progress).toBeGreaterThan(0);
    expect(r.progress).toBeLessThan(1);
  });
});
