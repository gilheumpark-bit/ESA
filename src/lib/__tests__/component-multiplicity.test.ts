/**
 * 한 심볼에 묶여 적힌 기기 대수를 잃지 않는다.
 *
 * 실측 2026-07-28: 22.9kV LBS 패널 실도면의 피뢰기가 `LA x 3` 한 항목으로
 * 나왔다. 손 판독 라벨은 3, 파이프라인은 1 — 환각도 누락도 아니고
 * 다중도를 안 읽은 것이다.
 *
 * 삼상 회로에서 LA·CT·PT 를 상별 3 개로 두고 도면엔 `x 3` 로 한 번만
 * 적는 것이 표준 관행이라, 이걸 못 읽으면 대수 집계·물량 산출·표준도면
 * 대조가 모두 1/3 로 나온다.
 *
 * 극수(`3P`)·상수(`3φ`)는 대수가 아니다 — 여기 걸리면 안 된다.
 */
import { parseSLDResponse } from '@/lib/sld-recognition';

function modelSaid(label: string, type = 'arrester'): string {
  return JSON.stringify({
    components: [{ id: 'c1', type, label, position: { x: 50, y: 50 } }],
    connections: [],
    confidence: 0.9,
    rawDescription: 'test',
  });
}

describe('기기 다중도', () => {
  it.each([
    ['LA x 3', 3],
    ['LA X 3', 3],
    ['LA x3', 3],
    ['P.T x 3 (MOLD) 380V/190V', 3],
    ['C.T ×3', 3],
    ['CT 3EA', 3],
    ['MCCB 6EA', 6],
    ['조명등 12개', 12],
  ])('%s → %i 대', (label, expected) => {
    const r = parseSLDResponse(modelSaid(label));
    expect(r.components[0].quantity).toBe(expected);
  });

  it.each([
    ['MCCB 3P', '극수'],
    ['TR 3φ 1000kVA', '상수'],
    ['ACB 4P 800AF', '극수'],
    ['CABLE 325sq', '단면적'],
    ['METER 0-500A', '눈금'],
    ['VCB 1250A', '정격전류'],
    ['TR-3', '기기 번호'],
  ])('%s 는 대수 표기가 아니다 — %s', (label) => {
    const r = parseSLDResponse(modelSaid(label));
    expect(r.components[0].quantity).toBeUndefined();
  });

  it('표기가 없으면 quantity 를 붙이지 않는다 — 1 로 채우면 추정이 사실처럼 보인다', () => {
    const r = parseSLDResponse(modelSaid('LA'));
    expect(r.components[0].quantity).toBeUndefined();
  });
});
