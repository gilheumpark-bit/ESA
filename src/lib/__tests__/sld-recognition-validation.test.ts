import { parseSLDResponse, generateCalcChainFromSLD } from '../sld-recognition';

describe('SLD recognition response validation', () => {
  it('drops unknown components, dangling edges, and lengths without explicit units', () => {
    const parsed = parseSLDResponse(JSON.stringify({
      components: [
        { id: 'p1', type: 'panel', label: 'MDB', position: { x: 10, y: 20 } },
        { id: 'l1', type: 'load', label: 'Load', position: { x: 90, y: 80 } },
        { id: 'bad-type', type: 'dragon', position: { x: 50, y: 50 } },
        { id: 'outside', type: 'motor', position: { x: 101, y: 50 } },
      ],
      connections: [
        { id: 'e1', from: 'p1', to: 'l1', length: '12.5m' },
        { id: 'e2', from: 'p1', to: 'missing', length: '2m' },
        { id: 'e3', from: 'p1', to: 'l1', length: 'approximately 12' },
      ],
      confidence: 4,
    }));

    expect(parsed.components.map(component => component.id)).toEqual(['p1', 'l1']);
    expect(parsed.connections).toEqual([
      expect.objectContaining({ id: 'e1', from: 'p1', to: 'l1', length: '12.5m' }),
      expect.objectContaining({ id: 'e3', from: 'p1', to: 'l1' }),
    ]);
    expect(parsed.connections[1].length).toBeUndefined();
    expect(parsed.confidence).toBe(1);
  });

  it('fails closed instead of assigning confidence to malformed output', () => {
    expect(parseSLDResponse('not json')).toEqual(expect.objectContaining({
      components: [],
      connections: [],
      confidence: 0,
    }));
    expect(parseSLDResponse(JSON.stringify({ components: {}, connections: [] }))).toEqual(expect.objectContaining({
      components: [],
      connections: [],
      confidence: 0,
    }));
  });
});

describe('generateCalcChainFromSLD — dependsOn 동적 결박 (버그 사냥 F7)', () => {
  const mk = (
    comps: import('../sld-recognition').SLDComponent[],
    conns: import('../sld-recognition').SLDConnection[] = [],
  ): import('../sld-recognition').SLDAnalysis => ({
    components: comps, connections: conns,
    suggestedCalculations: [], confidence: 0.9, rawDescription: 't',
  });

  it('load 없는 TR+cable에서 스텝이 자기 자신을 참조하지 않는다', () => {
    const chain = generateCalcChainFromSLD(mk(
      [{ id: 'c1', type: 'transformer', rating: '1000kVA', position: { x: 0, y: 0 } }],
      [{ id: 'n1', from: 'c1', to: 'c2', length: '10m' }],
    ));
    for (const step of chain) {
      expect(step.dependsOn ?? []).not.toContain(step.step);
      for (const dep of step.dependsOn ?? []) expect(dep).toBeLessThan(step.step);
    }
    const sc = chain.find((s) => s.calculatorId === 'short-circuit');
    const tx = chain.find((s) => s.calculatorId === 'transformer-sizing');
    expect(sc?.dependsOn).toEqual([tx!.step]);
  });

  it('load 있는 경로에서도 의존이 실제 선행 스텝을 가리킨다', () => {
    const chain = generateCalcChainFromSLD(mk(
      [
        { id: 'l1', type: 'load', rating: '10kW', position: { x: 0, y: 0 } },
        { id: 'c1', type: 'transformer', rating: '1000kVA', position: { x: 0, y: 0 } },
      ],
      [{ id: 'n1', from: 'c1', to: 'c2', length: '10m' }],
    ));
    for (const step of chain) {
      for (const dep of step.dependsOn ?? []) expect(dep).toBeLessThan(step.step);
    }
  });
});

describe('parseSLDResponse — VLM 펜스·주변텍스트 견고 추출 (라이브 검증 수리)', () => {
  const valid = { components: [{ id: 'c1', type: 'breaker', label: 'MCCB', position: { x: 10, y: 20 } }], connections: [] };

  it('```json 코드펜스로 감싼 응답을 파싱한다', () => {
    const r = parseSLDResponse('```json\n' + JSON.stringify(valid) + '\n```');
    expect(r.components).toHaveLength(1);
    expect(r.components[0].type).toBe('breaker');
  });

  it('펜스 앞뒤에 설명 문장이 붙어도 JSON을 뽑아낸다', () => {
    const r = parseSLDResponse('Here is the analysis:\n```json\n' + JSON.stringify(valid) + '\n```\nNote: values are HOLD.');
    expect(r.components).toHaveLength(1);
  });

  it('닫는 펜스가 없어도(절단 직전) 균형 JSON은 파싱한다', () => {
    const r = parseSLDResponse('```json\n' + JSON.stringify(valid));
    expect(r.components).toHaveLength(1);
  });

  it('펜스 없는 순수 JSON도 그대로 파싱한다', () => {
    expect(parseSLDResponse(JSON.stringify(valid)).components).toHaveLength(1);
  });
});
