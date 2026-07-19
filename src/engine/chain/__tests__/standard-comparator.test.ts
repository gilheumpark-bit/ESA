/**
 * standard-comparator — compareAmpacity가 실제 표준 허용전류표에 위임하는지 검증.
 * (수정 전: NEC=KEC×0.95, IEC=KEC×0.98 날조. 수정 후: 실 NEC 310.16 / IEC 60364-5-52 표.)
 */

import { compareAmpacity } from '../standard-comparator';
import { getIecAmpacity } from '@/data/ampacity-tables/iec-ampacity';
import { getNecAmpacity } from '@/data/ampacity-tables/nec-ampacity';

function amp(report: ReturnType<typeof compareAmpacity>, std: string): number | undefined {
  return report.entries.find((e) => e.standard === std)?.ampacity;
}

describe('compareAmpacity — 실 테이블 위임 (날조 제거)', () => {
  const opts = { size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit', ambientTemp: 30 } as const;

  test('IEC 값 = getIecAmpacity 실표 조회값 (mm² 네이티브)', () => {
    const r = compareAmpacity(opts);
    const iecDirect = Math.round(getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', ambientTemp: 30 }).corrected);
    expect(amp(r, 'IEC')).toBe(iecDirect);
  });

  test('NEC 값 = getNecAmpacity 실표 조회값 (25mm² → 최근접 3 AWG, 90°C)', () => {
    const r = compareAmpacity(opts);
    const necDirect = Math.round(getNecAmpacity({ size: '3', conductor: 'Cu', tempRating: 90, ambientTemp: 30 }).corrected);
    expect(amp(r, 'NEC')).toBe(necDirect);
  });

  test('날조 공식(KEC×0.95 / KEC×0.98)이 아니다', () => {
    const r = compareAmpacity(opts);
    const kec = amp(r, 'KEC')!;
    // 최소한 하나라도 옛 fudge와 다르면 날조가 제거된 것 (실표는 대개 둘 다 다름)
    const iecFudge = Math.round(kec * 0.98);
    const necFudge = Math.round(kec * 0.95);
    expect(amp(r, 'IEC') !== iecFudge || amp(r, 'NEC') !== necFudge).toBe(true);
    // 진단 출력
    console.log(`CMP 25mm²Cu XLPE → KEC=${kec} NEC=${amp(r, 'NEC')} IEC=${amp(r, 'IEC')} (fudge였으면 NEC=${necFudge} IEC=${iecFudge})`);
  });

  test('PVC는 NEC 75°C 등급으로 조회', () => {
    const r = compareAmpacity({ ...opts, insulation: 'PVC' });
    const necDirect = Math.round(getNecAmpacity({ size: '3', conductor: 'Cu', tempRating: 75, ambientTemp: 30 }).corrected);
    expect(amp(r, 'NEC')).toBe(necDirect);
  });
});
