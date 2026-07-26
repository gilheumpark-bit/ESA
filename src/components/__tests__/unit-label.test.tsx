/**
 * 화면의 단위 라벨은 엔진이 실제로 그렇게 읽을 단위여야 한다.
 *
 * 계산 실행기는 국가 프로파일이 Imperial 이면 length·ambientTemp·power 입력을
 * 피트·°F·HP 로 간주해 SI 로 환산한다(engine/conversion/imperial-adapter).
 * 그런데 폼은 정의된 SI 라벨을 그대로 보여줬다. 국가를 USA(NEC)로 둔 사용자가
 * "전선 길이 (편도)(m)" 를 보고 50 을 넣으면 엔진은 50 ft = 15.24 m 로 계산한다.
 *
 * 실측(2026-07-26): 같은 입력(380V 100A 50 35mm² Cu 3상 0.9)의 전압강하가
 * KR/JP/INT 4.14V ↔ US 1.26V. 3.286배 = 1/0.3048 — 정확히 피트 해석이고,
 * 과소평가라 한도를 넘는 회로가 PASS 로 나온다.
 */
import { readFileSync } from 'node:fs';
import { getSafetyProfile } from '@engine/constants/safety-factors';
import { convertInputsToSI } from '@engine/conversion/imperial-adapter';

describe('단위 라벨과 엔진 해석', () => {
  it('US 프로파일은 Imperial 이고 길이를 피트로 읽는다', () => {
    expect(getSafetyProfile('US').unitSystem).toBe('Imperial');
    const { converted } = convertInputsToSI({ length: 50 }, 'Imperial');
    expect(converted.length).toBeCloseTo(15.24, 4);
  });

  it('SI 프로파일은 길이를 그대로 둔다', () => {
    for (const country of ['KR', 'JP', 'INT'] as const) {
      expect(getSafetyProfile(country).unitSystem).toBe('SI');
    }
    const { converted } = convertInputsToSI({ length: 50 }, 'SI');
    expect(converted.length).toBe(50);
  });

  it('폼이 Imperial 일 때 단위 라벨을 바꿔 표시한다', () => {
    const src = readFileSync('src/components/CalculatorForm.tsx', 'utf8');
    // 어댑터가 변환하는 세 단위를 화면도 같이 바꿔야 한다.
    expect(src).toContain("case 'm': return 'ft';");
    expect(src).toContain("case '°C': return '°F';");
    expect(src).toContain("case 'kW': return 'HP';");
    // 단위계 판단은 엔진 프로파일에서 온다 — 화면에 목록을 또 만들지 않는다.
    expect(src).toContain('getSafetyProfile');
  });

  it('어댑터가 변환하는 입력 키가 늘면 라벨 매핑도 같이 봐야 한다', () => {
    // 이 목록이 바뀌면 displayUnit 도 다시 보라는 신호다.
    const adapter = readFileSync('src/engine/conversion/imperial-adapter.ts', 'utf8');
    expect(adapter).toContain("['length', 'distance', 'cableLength', 'totalLength_m']");
    expect(adapter).toContain("['ambientTemp', 'temperature', 'temp']");
  });
});
