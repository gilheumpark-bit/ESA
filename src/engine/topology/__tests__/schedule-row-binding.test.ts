/**
 * 분전반 일람표 행 결속 — KIMM EE-039 p14 실좌표 기반 반증 테스트
 *
 * 실측 기하(원본 pt 좌표): 부하명은 정격 텍스트의 아래(dy +4~8)·근접(dx ±20),
 * 태그(기존/SP/PNL/R1..)는 같은 행 대각(|dx| 20~60). 구판 휴리스틱(|dy|≤3·우측만)은
 * 이 기하와 정면 불일치라 헤더 텍스트(사용전압·GT)만 오결속했다(라이브 8/8 오탐 실측).
 */

import { bindScheduleRow } from '../schedule-row-binding';

const t = (x: number, y: number, text: string) => ({ x, y, text });

describe('일람표 행 결속 — 실좌표 케이스', () => {
  it('L열 기존회로: 부하명(아래)과 태그(우측 대각)를 분리 결속한다', () => {
    // 실측: MCCB 4P-100/75 @[97,255] · P-380#2B-1 @[105,262] · 기존 @[144,259]
    const r = bindScheduleRow(t(97, 255, 'MCCB 4P-100/75'), [
      t(105, 262, 'P-380#2B-1'),
      t(144, 259, '기존'),
      t(631, 215, 'MCCB 4P-400/300'), // 다른 판넬 열 — 무관
    ]);
    expect(r.load).toBe('P-380#2B-1');
    expect(r.tag).toBe('기존');
  });

  it('R열 무명 기존부하: 태그와 부하 칸이 둘 다 "기존"이어도 분리한다', () => {
    // 실측: MCCB 4P-100/75 @[244,255] · 기존(태그) @[225,259] · 기존(부하칸) @[258,262]
    const r = bindScheduleRow(t(244, 255, 'MCCB 4P-100/75'), [
      t(225, 259, '기존'),
      t(258, 262, '기존'),
    ]);
    expect(r.tag).toBe('기존');
    expect(r.load).toBe('기존');
  });

  it('SPARE 행: SP 태그와 SPARE 부하를 구분한다', () => {
    const r = bindScheduleRow(t(95, 228, 'MCCB 4P-250/250'), [
      t(103, 235, 'SPARE'),
      t(144, 232, 'SP'),
    ]);
    expect(r.tag).toBe('SP');
    expect(r.load).toBe('SPARE');
  });

  it('전열 회로: R2 태그를 회로번호로 잡고 전열을 부하로 잡는다', () => {
    const r = bindScheduleRow(t(515, 538, 'ELB 2P-30/20'), [
      t(523, 545, '전열'),
      t(548, 541, 'R2'),
    ]);
    expect(r.tag).toBe('R2');
    expect(r.load).toBe('전열');
  });

  it('MAIN 헤더 행: 아래 행 창(dy 3~9) 밖의 헤더 텍스트는 결속하지 않는다', () => {
    // 실측: MAIN @[108,175], FROM/사용전압/케이블은 dy +20 이상 아래 블록
    const r = bindScheduleRow(t(108, 175, 'MCCB 4P-400/400'), [
      t(125, 195, 'FROM LV1'),
      t(120, 165, '사용전압'),
      t(108, 175, 'MCCB 4P-400/400'), // 자기 자신
    ]);
    expect(r.load).toBeUndefined();
    expect(r.tag).toBeUndefined();
  });

  it('자간 벌린 인쇄("S P A R E")는 정규화해 결속한다', () => {
    const r = bindScheduleRow(t(364, 443, 'MCCB 3P-250/250'), [
      t(372, 450, 'S P A R E'),
      t(412, 447, 'SP'),
    ]);
    expect(r.load).toBe('SPARE');
    expect(r.tag).toBe('SP');
  });

  it('다른 설비 키워드·케이블 스펙 텍스트는 부하 후보에서 제외한다', () => {
    const r = bindScheduleRow(t(97, 255, 'MCCB 4P-100/75'), [
      t(105, 262, 'FCV 4-240/1C'), // 케이블 스펙 — 제외
      t(120, 261, 'TR-1'),          // 다른 설비 키워드 — 제외
    ]);
    expect(r.load).toBeUndefined();
  });
});
