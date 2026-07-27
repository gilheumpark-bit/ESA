/**
 * 수전점(인입)을 부하로 세지 않는다.
 *
 * 실측 2026-07-28: 22.9kV LBS 패널 실도면에서 `154S/S INCOMING LINE`
 * (properties.description = `FROM : 단지내 154S/S INCOMING LINE`)이
 * `load` 로 나왔다. 이 도면의 전원인데 부하가 됐다.
 *
 * 어휘(SLD_COMPONENT_TYPES)에 전원 자리가 없어서 갈 곳이 없었던 것이다 —
 * `ground`·`lamp`·`fuse` 가 없어 엉뚱한 타입에 얹혔던 것과 같은 구멍이다.
 *
 * 방향이 뒤집히면 상류/하류가 통째로 반대가 된다. 당장은 `hasLoads` 가
 * `max-demand`·`demand-diversity` 로 라우팅될 때 인입선이 수요 목록에
 * 들어간다(지금은 kW 표기가 없어 필터에 걸릴 뿐 잠복이다).
 *
 * 계기용 변성기 보정과 같은 방식으로 — 프롬프트로도 지시하되 모델 변덕에
 * 맡기지 않고 파싱 단계에서 결정적으로 되돌린다.
 */
import { parseSLDResponse, SLD_COMPONENT_TYPES } from '@/lib/sld-recognition';

function modelSaid(components: Array<{ type: string; label: string; description?: string }>): string {
  return JSON.stringify({
    components: components.map((c, i) => ({
      id: `comp_${i + 1}`,
      type: c.type,
      label: c.label,
      position: { x: 50, y: 50 },
      ...(c.description ? { properties: { description: c.description } } : {}),
    })),
    connections: [],
    confidence: 0.9,
    rawDescription: 'test',
  });
}

describe('수전점 분류', () => {
  it('어휘에 전원 자리가 있다', () => {
    expect(SLD_COMPONENT_TYPES).toContain('source');
  });

  it.each([
    ['154S/S INCOMING LINE', 'FROM : 단지내 154S/S INCOMING LINE'],
    ['INCOMING', undefined],
    ['INCOMER 22.9kV', undefined],
    ['수전점', undefined],
    ['인입선', undefined],
    ['한전 인입', undefined],
    ['KEPCO SUPPLY', undefined],
    ['UTILITY', undefined],
    ['미상', 'FROM : 154kV S/S'],
  ])('%s 는 부하가 아니라 전원으로 센다', (label, description) => {
    const r = parseSLDResponse(modelSaid([{ type: 'load', label, description }]));
    expect(r.components[0].type).toBe('source');
  });

  it('진짜 부하는 그대로 둔다 — 과잉 보정하면 부하가 사라진다', () => {
    for (const label of ['MOTOR LOAD 15kW', '조명부하', 'GENERAL LOAD', '전열 부하 3kW', 'EV CHARGER']) {
      const r = parseSLDResponse(modelSaid([{ type: 'load', label }]));
      expect(r.components[0].type).toBe('load');
    }
  });

  it('다른 타입은 건드리지 않는다 — 계기 인출선의 FROM 표기까지 옮기지 않는다', () => {
    // 실도면의 `VS` 스위치는 properties.source 가 `FROM SV-VCS#1 PT LINE` 이다.
    const r = parseSLDResponse(modelSaid([
      { type: 'switch', label: 'VS', description: 'FROM SV-VCS#1 PT LINE' },
    ]));
    expect(r.components[0].type).toBe('switch');
  });

  it('보정 사실을 경고로 남긴다 — 조용히 고치면 모델이 계속 틀리는 게 안 보인다', () => {
    const r = parseSLDResponse(modelSaid([
      { type: 'load', label: '154S/S INCOMING LINE', description: 'FROM : 단지내 154S/S INCOMING LINE' },
    ]));
    expect((r.warnings ?? []).join(' ')).toMatch(/수전|전원|INCOMING/i);
  });
});
