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

  it('폼이 어댑터와 같은 목록을 보고 라벨을 바꾼다', () => {
    const src = readFileSync('src/components/CalculatorForm.tsx', 'utf8');
    // 단위 문자열이 아니라 파라미터 이름으로 고른다 — 목록은 어댑터에서 가져온다.
    expect(src).toContain('IMPERIAL_LENGTH_KEYS');
    expect(src).toContain('IMPERIAL_TEMP_KEYS');
    // 단위계 판단도 엔진 프로파일에서 온다 — 화면에 국가 목록을 또 만들지 않는다.
    expect(src).toContain('getSafetyProfile');
    // 전력은 어댑터가 _powerUnit 플래그가 있을 때만 변환하므로 라벨을 바꾸지 않는다.
    expect(src).not.toContain("return 'HP'");
  });

  /**
   * 라벨만 바꾸면 **반대 방향** 오류가 난다. 단위가 'm' 이라도 어댑터의 변환
   * 목록에 없는 파라미터는 SI 로 읽히므로, 그 칸을 ft 로 적으면 사용자가
   * 피트를 넣고 엔진이 미터로 계산한다. 실측(2026-07-26): 단위 'm' 13개 중
   * 4개(rodLength·spacing·buildingHeight·leadLength), '°C' 7개 중 3개가
   * 그 경우였다.
   */
  it('변환하지 않는 파라미터는 SI 라벨을 유지해야 한다', () => {
    const notConverted = [
      { name: 'rodLength', unit: 'm' },
      { name: 'spacing', unit: 'm' },
      { name: 'buildingHeight', unit: 'm' },
      { name: 'leadLength', unit: 'm' },
      { name: 'referenceTemp', unit: '°C' },
    ];
    for (const p of notConverted) {
      const { converted } = convertInputsToSI({ [p.name]: 50 }, 'Imperial');
      // 어댑터가 손대지 않는다는 사실 자체를 고정한다 — 여기가 바뀌면 라벨도 봐야 한다.
      expect(converted[p.name]).toBe(50);
    }
  });
});
