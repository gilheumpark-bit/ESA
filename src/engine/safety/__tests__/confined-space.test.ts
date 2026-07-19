import { parseSafetyIntent } from '@/lib/safety-intent-parser';
import { analyzeSafety } from '@engine/safety/confined-space';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — 비밀폐 위험장소에서 체크리스트가 비던 결함
//
// 기본 전기안전 항목이 `!isConfinedSpace && !intent.location` 조건에 걸려 있어,
// 작업 위치를 입력할수록 체크리스트가 비는 역전이 있었다.
// 실측: '전기실에서 배전반 작업 3명' → checkItems 0, overallRisk 'low'
// (파서는 해당 위치를 isHazardous=true로 표시해 넘기고 있었다)
// ═══════════════════════════════════════════════════════════════════════════════

describe('analyzeSafety — 비밀폐 위험장소', () => {
  test('전기실 작업에 기본 전기안전 항목이 포함된다', () => {
    const analysis = analyzeSafety(parseSafetyIntent('전기실에서 배전반 작업 3명'));
    expect(analysis.checkItems.length).toBeGreaterThan(0);
    expect(analysis.checkItems.some(i => i.title.includes('LOTO'))).toBe(true);
    expect(analysis.checkItems.some(i => i.title.includes('보호구'))).toBe(true);
  });

  test('전기실 작업의 종합 위험도가 low가 아니다', () => {
    const analysis = analyzeSafety(parseSafetyIntent('전기실에서 배전반 작업 3명'));
    expect(analysis.overallRisk).not.toBe('low');
  });

  test('옥상 작업에도 기본 전기안전 항목이 포함된다', () => {
    const analysis = analyzeSafety(parseSafetyIntent('옥상 수전설비 점검 2명'));
    expect(analysis.checkItems.length).toBeGreaterThan(0);
  });
});

describe('analyzeSafety — 기존 동작 유지 (회귀 방지)', () => {
  test('위치 미지정 작업은 기본 항목을 계속 받는다', () => {
    const analysis = analyzeSafety(parseSafetyIntent('배전반 점검 2명'));
    expect(analysis.checkItems.length).toBeGreaterThan(0);
  });

  test('밀폐공간은 전용 필수항목과 critical 판정을 유지한다', () => {
    const analysis = analyzeSafety(parseSafetyIntent('맨홀 내부 작업 2명'));
    expect(analysis.checkItems.length).toBeGreaterThanOrEqual(8);
    expect(analysis.overallRisk).toBe('critical');
  });
});
