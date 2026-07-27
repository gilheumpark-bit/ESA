/**
 * 문맥 판별 규칙 — 같은 글자가 자리에 따라 다른 것을 뜻한다.
 *
 * 이번 세션 내내 "글자만으로는 못 정한다" 며 보류해 온 것들인데, 현장 규칙을
 * 받아 넣었다(2026-07-27).
 *
 *   PF   심볼이 함께 있으면 전력퓨즈, 없으면 역률계
 *   전압  케이블·모선에 붙으면 절연등급, 장치에 붙으면 전압
 *
 * 둘 다 내가 실제로 틀렸던 자리다 — 세종 배전반 도면의 모선 `600V 3Ø4W` 를
 * 계통전압으로 읽었는데 절연등급이었고, 계통은 PT 가 말하는 380V 였다.
 */
import { detectComponentType } from '@/engine/topology/pdf-vector-parser';
import { parseSLDResponse } from '@/lib/sld-recognition';

describe('PF — 전력퓨즈 vs 역률계', () => {
  it('계기 글자와 함께 나오면 역률계다', () => {
    // 실도면(세종 p1) 계기반 표기가 이 형태였다.
    expect(detectComponentType('V A W PF F')).toBe('meter');
    expect(detectComponentType('PF Hz')).toBe('meter');
    expect(detectComponentType('W PF')).toBe('meter');
  });

  it('퓨즈 정격이 붙으면 전력퓨즈다', () => {
    // `fuse` 타입 신설 전에는 breaker 로 갔다(2026-07-27 정정).
    // 퓨즈는 차단기와 다른 기기다 — 재투입이 안 되고 교체해야 한다.
    expect(detectComponentType('PF 100A')).toBe('fuse');
    expect(detectComponentType('P.F 200A')).toBe('fuse');
    expect(detectComponentType('PF 전력퓨즈')).toBe('fuse');
  });

  it('단서가 없으면 어느 쪽으로도 밀지 않는다', () => {
    // 애매한 것을 한쪽으로 밀어붙이면 그 자리가 조용히 틀린 채로 남는다.
    expect(detectComponentType('PF')).toBe('load');
  });
});

describe('전압 — 절연등급 vs 계통전압', () => {
  const said = (systemVoltage: string, comps: Array<{ type: string; label: string; voltage?: string }>) =>
    JSON.stringify({
      components: comps.map((c, i) => ({
        id: `comp_${i + 1}`, type: c.type, label: c.label,
        ...(c.voltage ? { voltage: c.voltage } : {}),
        position: { x: 50, y: 50 },
      })),
      connections: [], systemVoltage, confidence: 0.9, rawDescription: '',
    });

  it('계통전압이 모선 표기와 같으면 절연등급 의심을 남긴다', () => {
    // 세종 배전반 실도면 재현: 모선 600V(절연등급), 실제 계통 380V.
    const r = parseSLDResponse(said('600V', [
      { type: 'bus', label: 'LV 2', voltage: '600V' },
      { type: 'breaker', label: 'MCCB 4P 250AF 150AT' },
    ]));
    expect(r.warnings?.join(' ')).toContain('SYSTEM_VOLTAGE_MAY_BE_INSULATION_CLASS');
  });

  it('PT 가 있으면 계통전압의 독립 근거가 있으므로 경고하지 않는다', () => {
    const r = parseSLDResponse(said('600V', [
      { type: 'bus', label: 'LV 2', voltage: '600V' },
      { type: 'meter', label: 'P.T x 3 (MOLD)', voltage: '380V/190V' },
    ]));
    expect(r.warnings ?? []).toEqual([]);
  });

  it('장치에 붙은 전압과 같은 것은 경고하지 않는다 — 그건 계통전압일 수 있다', () => {
    // 삼성 22.9kV 도면: LBS 24kV 는 기기 정격이고 계통은 22.9kV 다.
    const r = parseSLDResponse(said('22.9kV', [
      { type: 'switch', label: 'L.B.S #1', voltage: '24kV' },
      { type: 'arrester', label: 'LA x 3', voltage: '18kV' },
    ]));
    expect(r.warnings ?? []).toEqual([]);
  });

  it('값을 지우지는 않는다 — 같다는 사실만으로 틀렸다고 단정할 수 없다', () => {
    // 22.9kV 계통은 케이블 정격도 22.9kV 라 실제로 같다.
    const r = parseSLDResponse(said('22.9kV', [
      { type: 'cable', label: 'FR-CNCO-W 325sq', voltage: '22.9kV' },
    ]));
    expect(r.systemVoltage).toBe('22.9kV');   // 경고는 하되 값은 살린다
  });
});
