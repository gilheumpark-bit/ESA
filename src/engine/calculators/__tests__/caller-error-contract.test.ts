import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError } from '../types';

/**
 * 계산 경로의 **거부는 호출자 잘못이지 서버 고장이 아니다.**
 *
 * `/api/calculate` 는 `CalcValidationError` 를 422 로, 나머지 예외를 500
 * `"Internal calculation error"` 로 내보낸다. 그래서 평문 `throw new Error(`
 * 하나가 곧 사용자에게 **아무 쓸모 없는 메시지 한 줄**이 된다.
 *
 * 실측 2026-07-28: 주위 온도 75°C + PVC 로 계산하면 500 이 나오고 화면에
 * "Internal calculation error" 가 떴다. 같은 모양이 계산 경로에 **35 자리**
 * 있었다 — 케이블 굵기 미지원, 설치방법 조합 없음, 부하 항목 0 개, 역률
 * 대소 역전 … 전부 사용자가 고칠 수 있는 입력인데 전부 "서버 오류" 였다.
 *
 * 이 검사는 그 35 자리를 되돌리지 못하게 잠근다. 새로 평문 `Error` 를
 * 넣으면 여기서 깨진다.
 *
 * 진짜 내부 불변식 위반(있어서는 안 되는 상태)이라면 500 이 맞다 —
 * 그때는 아래 `ALLOWED` 에 **사유와 함께** 등재한다(§2.5-② 대장 규율).
 * 지금은 비어 있다.
 */

const SRC = join(__dirname, '..', '..', '..');
const SCANNED = [
  join(SRC, 'engine', 'calculators'),
  join(SRC, 'data', 'ampacity-tables'),
];

/** 평문 Error 가 허용되는 자리 — `파일:사유`. 등재 없이 늘리지 말 것. */
const ALLOWED: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('계산 경로 — 호출자 잘못은 500 이 아니다', () => {
  const files = SCANNED.flatMap((d) => walk(d));

  it('훑는 파일이 있다 — 이 검사가 공회전이 아님', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('평문 `throw new Error(` 가 없다', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.slice(SRC.length + 1).replace(/\\/g, '/');
      if (ALLOWED[rel]) continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/throw new Error\(/.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('탐지 정규식이 실제로 무언가를 잡는다 — 패턴 오타로 0건이 되지 않도록', () => {
    // 자기반증: 같은 패턴을 일부러 만족시키는 문자열이 걸리는지 본다.
    expect(/throw new Error\(/.test("throw new Error('x')")).toBe(true);
    // 그리고 변환된 형태는 안 걸려야 한다.
    expect(/throw new Error\(/.test("throw new CalcValidationError('f', 'x')")).toBe(false);
  });

  /**
   * 문자열 검사만으로는 "던지긴 하는데 엉뚱한 타입" 을 못 본다.
   * 대표 계산기들을 실제로 나쁜 입력으로 돌려 본다.
   */
  describe('실제로 CalcValidationError 를 던진다', () => {
    const CASES: Array<[string, Record<string, unknown>]> = [
      ['max-demand', { loads: [] }],
      ['power-factor', { activePower: 100 }],
      ['reactive-power', { activePower: 100, currentPF: 0.9, targetPF: 0.8 }],
      ['relay-basic', { loadCurrent: 100, faultCurrent: 50 }],
      ['parallel-operation', { transformers: [{ capacity_kVA: 500, impedance_percent: 5 }] }],
      ['busbar-vd', { sections: [] }],
      ['complex-voltage-drop', { sections: [] }],
      ['substation-capacity', { loads: [] }],
      ['emergency-generator', { loads: [] }],
      ['demand-diversity', { individualMaxDemands: [] }],
    ];

    it.each(CASES)('%s', (id, inputs) => {
      const entry = CALCULATOR_REGISTRY.get(id);
      expect(entry).toBeDefined();
      let thrown: unknown = null;
      try {
        entry!.calculator(inputs);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).not.toBeNull();
      expect(thrown).toBeInstanceOf(CalcValidationError);
      // 어느 칸이 문제인지 지목해야 화면이 그 칸을 짚어 줄 수 있다.
      expect((thrown as CalcValidationError).field).toBeTruthy();
    });
  });

  /** 정상 입력이 막히면 수리가 아니라 회귀다(§2.11). */
  it('정상 입력은 계속 계산된다', () => {
    const ok = CALCULATOR_REGISTRY.get('max-demand')!.calculator({
      loads: [
        { name: 'A', ratedPower: 10, demandFactor: 0.8 },
        { name: 'B', ratedPower: 20, demandFactor: 0.7 },
      ],
      diversityFactor: 1.2,
    });
    expect(ok.value).toBeGreaterThan(0);
  });
});
