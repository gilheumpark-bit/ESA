import { getAmpacity } from '../kec-ampacity';
import { getIecAmpacity } from '../iec-ampacity';
import { getNecAmpacity } from '../nec-ampacity';
import { CalcValidationError } from '@/engine/calculators/types';

/**
 * 주위 온도가 도체 한계를 넘었을 때 **누구 잘못인지**를 잠근다.
 *
 * 라이브 실측 2026-07-28 — `/calc/cable/cable-sizing` 에서 주위 온도 75°C
 * (입력칸 `max` 가 80 을 허용한다) + PVC 로 계산하면:
 *
 *   POST /api/calculate → **500** `{"code":"ESVA-4999","message":"Internal calculation error"}`
 *   화면 → "Internal calculation error"
 *
 * 호출자가 잘못 넣은 값인데 **서버 고장으로 보고**됐고, 사용자는 무엇을
 * 고쳐야 하는지 알 수 없었다. 원인은 표가 평문 `Error` 를 던져
 * `/api/calculate` 의 마지막 catch 로 떨어진 것이다 — 라우트에는 이미
 * `CalcValidationError → 422` 분기가 있었는데 그 길로 못 갔다.
 *
 * 세 표(KEC·IEC·NEC)를 모두 잠근다. **`cable-sizing` 이 실제로 쓰는 것은
 * IEC 경로다** — 처음에 KEC 만 고치고 라이브에서 여전히 500 을 받았다.
 * 어느 표를 쓰는지 추측하지 말고 셋 다 같은 계약을 지키게 한다.
 */

const CASES: Array<[string, () => unknown, RegExp]> = [
  ['KEC', () => getAmpacity({
    size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: 75,
  }), /70°C/],
  ['IEC 공기', () => getIecAmpacity({
    size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: 75,
  }), /70°C/],
  ['IEC 지중', () => getIecAmpacity({
    size: 16, conductor: 'Cu', insulation: 'PVC', method: 'D', ambientTemp: 75,
  }), /70°C/],
  ['NEC', () => getNecAmpacity({
    size: '6', conductor: 'Cu', tempRating: 75, ambientTemp: 90,
  }), /°C/],
];

describe('주위 온도 초과 — 호출자 잘못이지 서버 고장이 아니다', () => {
  it.each(CASES)('%s 표가 CalcValidationError 를 던진다', (_이름, run) => {
    expect(run).toThrow(CalcValidationError);
  });

  it.each(CASES)('%s 오류가 어느 칸인지 지목한다', (_이름, run) => {
    try {
      run();
      throw new Error('던지지 않았다 — 이 검사가 헛돈다');
    } catch (e) {
      expect(e).toBeInstanceOf(CalcValidationError);
      expect((e as CalcValidationError).field).toBe('ambientTemp');
    }
  });

  /**
   * 메시지가 **다음에 무엇을 할지** 말해야 한다. "exceeds maximum" 만으로는
   * 한계가 몇 도인지도, 무엇을 바꿔야 하는지도 알 수 없다.
   */
  it.each(CASES)('%s 메시지가 한계값과 대안을 적는다', (_이름, run, limitRe) => {
    try {
      run();
      throw new Error('던지지 않았다');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(limitRe);
      expect(msg).toMatch(/XLPE|낮추|정격/);
      // 영어 스택 문구가 그대로 사용자에게 가지 않도록.
      expect(msg).not.toMatch(/Internal calculation error|exceeds maximum/);
    }
  });

  /**
   * **한계값이 절연마다 달라야 한다.** 메시지에 70 을 박아 두면 XLPE(90°C)
   * 사용자에게 거짓말을 한다 — 변이 실측에서 `limit` 을 상수 70 으로 바꿔도
   * 초록이었다(2026-07-28). PVC 는 70 밖에 안 나와서 안 걸렸다.
   */
  it('절연마다 다른 한계값을 적는다 — XLPE 는 90°C 다', () => {
    try {
      getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'XLPE', method: 'C', ambientTemp: 95 });
      throw new Error('던지지 않았다');
    } catch (e) {
      expect(e).toBeInstanceOf(CalcValidationError);
      expect((e as Error).message).toMatch(/90°C/);
      expect((e as Error).message).not.toMatch(/70°C/);
    }
  });

  /**
   * 정상 입력까지 막으면 수리가 아니라 회귀다(§2.11).
   */
  it('한계 안의 온도는 계속 계산된다', () => {
    for (const t of [30, 45, 60, 69]) {
      expect(() => getIecAmpacity({
        size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: t,
      })).not.toThrow();
    }
    // XLPE 는 90°C 라 75°C 에서 멀쩡해야 한다 — 절연을 안 보고 막으면 여기서 깨진다.
    expect(() => getIecAmpacity({
      size: 16, conductor: 'Cu', insulation: 'XLPE', method: 'C', ambientTemp: 75,
    })).not.toThrow();
  });
});
