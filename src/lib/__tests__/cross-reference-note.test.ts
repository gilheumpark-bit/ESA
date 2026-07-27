/**
 * 타 도면 참조 주석을 기기로 세지 않는다.
 *
 * 실측 2026-07-28: 22.9kV LBS 패널 도면에서 `FROM SV-VCS#1 PT LINE` 과
 * `FROM SV-VCS#1 CT LINE` 이 `meter` 부품으로 나왔다. 계기 수가 라벨 2
 * 에 대해 4 가 됐다.
 *
 * 이 둘은 VS(전압절환스위치)·AS(전류절환스위치)의 인출선이 어디서
 * 오는지 적은 **주석**이지 이 도면 위의 기기가 아니다. 같은 도면 첫
 * 실행에서는 VS·AS 의 `properties.source` 로 제대로 잡혔다 — 실행마다
 * 달라지므로 프롬프트로만 막을 수 없다.
 *
 * 지우지 않고 `annotation` 으로 옮긴다. 도면에 적힌 정보라 버리면 안
 * 되고, 기기 대수에는 들어가면 안 된다.
 *
 * 과잉 보정 경계: 정격·전압·전류가 하나라도 적힌 것은 기기다. 차단기·
 * 개폐기처럼 자기 심볼로 그려지는 기기는 `TO MCC-1` 같은 행선지 주석이
 * 라벨에 붙어도 기기 그대로 둔다.
 */
import { parseSLDResponse } from '@/lib/sld-recognition';

function modelSaid(c: { type: string; label: string; rating?: string; voltage?: string; current?: string }): string {
  return JSON.stringify({
    components: [{ id: 'c1', position: { x: 50, y: 50 }, ...c }],
    connections: [],
    confidence: 0.9,
    rawDescription: 'test',
  });
}

describe('타 도면 참조 주석', () => {
  it.each([
    ['meter', 'FROM SV-VCS#1 PT LINE'],
    ['meter', 'FROM SV-VCS#1 CT LINE'],
    ['load', 'TO SV-TIE LBS PANEL'],
    ['panel', 'TO SV-GPT#1 PANEL'],
    ['load', 'FROM MCC-101'],
  ])('%s "%s" 는 기기가 아니라 주석으로 센다', (type, label) => {
    const r = parseSLDResponse(modelSaid({ type, label }));
    expect(r.components[0].type).toBe('annotation');
  });

  it.each([
    ['load', 'TO PUMP ROOM', { rating: '15kW' }],
    ['meter', 'FROM CT LINE', { current: '0-500A' }],
    ['panel', 'TO MDB', { voltage: '380V' }],
  ])('%s "%s" 는 정격이 적혀 있으니 기기다', (type, label, spec) => {
    const r = parseSLDResponse(modelSaid({ type, label, ...spec }));
    expect(r.components[0].type).toBe(type);
  });

  it.each([
    ['breaker', 'TO MCC-1'],
    ['switch', 'FROM SV-VCS#1'],
    ['transformer', 'TO 380V BUS'],
    ['arrester', 'FROM LINE'],
  ])('%s "%s" 는 자기 심볼로 그려지는 기기라 그대로 둔다', (type, label) => {
    const r = parseSLDResponse(modelSaid({ type, label }));
    expect(r.components[0].type).toBe(type);
  });

  it('수전점은 주석으로 밀려나지 않는다 — FROM 으로 시작해도 전원이다', () => {
    const r = parseSLDResponse(modelSaid({ type: 'source', label: 'FROM : 단지내 154S/S INCOMING LINE' }));
    expect(r.components[0].type).toBe('source');
  });

  it('부하로 나온 수전점도 주석이 아니라 전원으로 간다', () => {
    const r = parseSLDResponse(modelSaid({ type: 'load', label: 'FROM : 154S/S INCOMING LINE' }));
    expect(r.components[0].type).toBe('source');
  });

  it('보정 사실을 경고로 남긴다 — 누산기만 두고 메시지를 안 내면 조용히 사라진다', () => {
    const r = parseSLDResponse(modelSaid({ type: 'meter', label: 'FROM SV-VCS#1 PT LINE' }));
    expect((r.warnings ?? []).join(' ')).toContain('CROSS_REFERENCE_NOTE');
  });

  it('FROM·TO 로 시작하지 않는 기기는 건드리지 않는다', () => {
    for (const label of ['V', 'A', 'MDB', '일반 부하']) {
      const r = parseSLDResponse(modelSaid({ type: 'meter', label }));
      expect(r.components[0].type).toBe('meter');
    }
  });
});
