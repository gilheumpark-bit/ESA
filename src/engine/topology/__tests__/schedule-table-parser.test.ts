/**
 * 케이블 스케줄 표 파서 — KIMM EE-007 실좌표 기반 known-answer
 *
 * 실측 헤더(y112): PANEL NO@135·NO@168·FROM@191·TO@230·전원방식@258·외함크기@301·
 * CABLE SCHEDLE@357(도면 오타·U 누락)·REMARK@409. 각 행이 한 피더이고 REMARK에
 * 차단기·CABLE 열에 케이블이 있다 — SLD에서 UNKNOWN이던 분기 데이터의 원천.
 */

import { parseScheduleTables } from '../schedule-table-parser';

const t = (s: string, x: number, y: number) => ({ s, x, y });

// 표제 2회(표 문서 판정) + 헤더 + 실측 데이터 행 2개
const header = [
  t('PANEL NO', 135, 112), t('NO', 168, 112), t('FROM', 191, 112), t('TO', 230, 112),
  t('전원방식', 258, 112), t('외함크기', 301, 112), t('CABLE SCHEDLE', 357, 112), t('REMARK', 409, 112),
];
const titles = [t('CABLE SCHEDULE (전력간선)', 150, 102), t('CABLE SCHEDULE (동력)', 461, 102)];

describe('parseScheduleTables — 실좌표 행 추출', () => {
  it('헤더 오타(SCHEDLE)에도 cable 열을 잡고 행별 차단기·케이블을 분리한다', () => {
    const rows = [
      // 행1: PNL 2 · FROM 지하변전실 LV2 · TO 분전반 · 3φ3W 220V · MCCB 3P 250/150 · FCV 35sq
      t('PNL', 143, 140), t('2', 146, 140), t('2', 171, 140), t('지하변전실', 188, 140), t('LV2', 195, 140),
      t('분전반-변전실', 217, 140), t('3φ 3W', 260, 140), t('220V', 262, 140),
      t('W:450 H:600 D:200', 285, 140), t('54C (FCV 1-35/3C,E-16)', 345, 140),
      t('MCCB 3P', 408, 140), t('250/150', 410, 140),
    ];
    const tables = parseScheduleTables([...titles, ...header, ...rows], 900);
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const r = tables[0].rows[0].cells;
    expect(r.cable).toContain('FCV');
    expect(r.remark).toContain('MCCB 3P');
    expect(r.remark).toContain('250/150');
    expect(r.from).toContain('지하변전실');
  });

  it('표제가 1회뿐이면(표 문서 아님) 추출하지 않는다', () => {
    const single = [t('CABLE SCHEDULE', 150, 102), ...header];
    expect(parseScheduleTables(single, 900)).toHaveLength(0);
  });

  it('헤더가 없으면 빈 결과', () => {
    expect(parseScheduleTables([...titles, t('아무거나', 100, 200)], 900)).toHaveLength(0);
  });
});
