/**
 * 피뢰기는 라벨로 확정한다 — 모델이 매번 다른 타입을 낸다.
 *
 * 같은 이미지(22.9kV LBS 패널)를 2026-07-28 에 5 회 돌렸더니 `LA x 3` 의
 * 타입이 `arrester` 4 회 · `load` 1 회로 갈렸다. 부품 총수도 7~13 으로
 * 흔들렸다. 어휘를 넓히고 프롬프트에 규칙을 넣어도 실행 간 변동은 남는다.
 *
 * 피뢰기는 수전설비 필수 보호기기이고 KEC 341.13(피뢰기의 시설)·341.14
 * (피뢰기의 접지) 대상이라, 있는데 0 으로 세어지면 그 판정이 통째로 빠진다.
 * 라벨이 명시적으로 피뢰기를 가리키면 타입을 결정적으로 되돌린다 —
 * 계기용 변성기 보정과 같은 방식이다.
 *
 * 과잉 보정 경계: `L.B.S`(부하개폐기)·`LA-3`(반 번호) 처럼 LA 가 다른
 * 뜻으로 쓰인 것까지 옮기면 진짜 기기가 사라진다.
 */
import { parseSLDResponse } from '@/lib/sld-recognition';

function modelSaid(type: string, label: string, extra: Record<string, string> = {}): string {
  return JSON.stringify({
    components: [{ id: 'c1', type, label, position: { x: 50, y: 50 }, ...extra }],
    connections: [],
    confidence: 0.9,
    rawDescription: 'test',
  });
}

describe('피뢰기 분류', () => {
  it.each([
    ['load', 'LA x 3'],
    ['load', 'L.A x3 18kV 5kA'],
    ['switch', 'LA'],
    ['panel', '피뢰기'],
    ['load', 'Lightning Arrester 18kV'],
    ['load', 'Surge Arrester'],
  ])('%s "%s" 는 피뢰기로 되돌린다', (type, label) => {
    const r = parseSLDResponse(modelSaid(type, label));
    expect(r.components[0].type).toBe('arrester');
  });

  it('묶음 대수는 보정 후에도 남는다 — LA x 3 은 피뢰기 3 대다', () => {
    const r = parseSLDResponse(modelSaid('load', 'LA x 3'));
    expect(r.components[0].type).toBe('arrester');
    expect(r.components[0].quantity).toBe(3);
  });

  it.each([
    ['switch', 'L.B.S'],
    ['switch', 'LBS#1 SV'],
    ['panel', 'LA-3 분전반'],
    ['load', 'SOLAR ARRAY'],
    ['load', '조명부하'],
  ])('%s "%s" 는 피뢰기가 아니다', (type, label) => {
    const r = parseSLDResponse(modelSaid(type, label));
    expect(r.components[0].type).toBe(type);
  });

  it('이미 피뢰기면 그대로 둔다', () => {
    const r = parseSLDResponse(modelSaid('arrester', 'LA x 3'));
    expect(r.components[0].type).toBe('arrester');
  });

  it('보정 사실을 경고로 남긴다', () => {
    const r = parseSLDResponse(modelSaid('load', 'LA x 3'));
    expect((r.warnings ?? []).join(' ')).toContain('ARRESTER_RECLASSIFIED');
  });
});
