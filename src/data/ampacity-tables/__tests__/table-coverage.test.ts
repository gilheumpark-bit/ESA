import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getAmpacity } from '../kec-ampacity';
import { getNecAmpacity } from '../nec-ampacity';
import { CalcValidationError } from '@/engine/calculators/types';

/**
 * **유효한 조합에는 표가 있어야 한다.**
 *
 * 독립 심사 지적(2026-07-28): "500 → 422 는 수리가 아니라 *분류* 변경이다.
 * 35 곳 중 하나라도 진짜 서버 결함이었다면 이제 '호출자 잘못' 으로 나가고
 * 경보가 죽는다."
 *
 * 실제로 한 자리가 그랬다. `No ampacity data for: ${tableKey}` 는 도체·절연·
 * 공사방법이 **상류 검증을 모두 통과한 뒤** 표를 못 찾았을 때 난다 — 그건
 * 호출자 입력이 아니라 **우리 표에 구멍이 난 것**이다. 그런데 일괄 변환에서
 * `CalcValidationError('insulation', …)` 로 바꿔 사용자에게 "절연 종류가
 * 잘못됐다"(422) 를 내보내고 페이징을 죽였다. 500 으로 되돌렸다.
 *
 * 되돌리는 것만으로는 부족하다 — 그 500 은 **운영에서 처음 보게 된다**.
 * 그래서 조합 공간을 여기서 미리 훑는다. 표가 빠지면 배포 전에 깨진다.
 */

describe('허용전류표 조합 커버리지', () => {
  const KEC = {
    conductor: ['Cu', 'Al'] as const,
    insulation: ['PVC', 'XLPE', 'MI'] as const,
    installation: ['conduit', 'tray', 'directBuried', 'freeAir'] as const,
  };

  it('KEC — 유효 조합 전부에 표가 있다', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const conductor of KEC.conductor) {
      for (const insulation of KEC.insulation) {
        for (const installation of KEC.installation) {
          checked += 1;
          try {
            getAmpacity({ size: 16, conductor, insulation, installation });
          } catch (e) {
            // 굵기가 그 조합에 없는 것은 정상(표마다 범위가 다르다).
            // 여기서 잡으려는 것은 **표 자체가 없는** 경우다.
            if (/허용전류표 누락|No ampacity data/.test((e as Error).message)) {
              missing.push(`${conductor}/${insulation}/${installation}`);
            }
          }
        }
      }
    }
    expect(checked).toBe(24); // 훑기가 줄어들면 커버리지 주장이 거짓이 된다
    expect(missing).toEqual([]);
  });

  it('NEC — 유효 조합 전부에 표가 있다', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const conductor of ['Cu', 'Al'] as const) {
      for (const tempRating of [60, 75, 90] as const) {
        checked += 1;
        try {
          getNecAmpacity({ size: '6', conductor, tempRating });
        } catch (e) {
          if (/허용전류표 누락|No NEC ampacity data/.test((e as Error).message)) {
            missing.push(`${conductor}/${tempRating}`);
          }
        }
      }
    }
    expect(checked).toBe(6);
    expect(missing).toEqual([]);
  });

  /**
   * 표 누락은 **우리 잘못**이므로 `CalcValidationError` 가 아니어야 한다 —
   * 그래야 라우트가 500 을 내고 경보가 울린다.
   */
  it('표 누락 오류는 호출자 잘못으로 분류되지 않는다', () => {
    const kec = readSource('kec-ampacity.ts');
    const nec = readSource('nec-ampacity.ts');
    for (const [name, src] of [['KEC', kec], ['NEC', nec]] as const) {
      const line = src.split(/\r?\n/).find((l) => /허용전류표 누락/.test(l)) ?? '';
      expect(`${name}:${line}`).toMatch(/throw new Error\(/);
      expect(line).not.toMatch(/CalcValidationError/);
      // 내부 표식이 있어야 계약 게이트가 이 자리를 허용한다.
      expect(line).toMatch(/ESVA-INTERNAL:/);
    }
  });

  /** 입력이 실제로 틀린 경우는 여전히 호출자 잘못이다 — 되돌림이 과했는지 본다. */
  it('진짜 잘못된 입력은 계속 CalcValidationError 다', () => {
    expect(() => getAmpacity({
      size: 9999, conductor: 'Cu', insulation: 'PVC', installation: 'conduit',
    })).toThrow(CalcValidationError);
  });
});

function readSource(file: string): string {
  return readFileSync(join(__dirname, '..', file), 'utf8');
}
