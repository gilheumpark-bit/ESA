/**
 * 도면 → "확인이 필요한 계산 항목" 계약.
 *
 * 실측(2026-07-26) 당시 이 기능은 세 겹으로 끊겨 있었다.
 *   1. DXF·PDF 벡터 파서가 `suggestedCalculations: []` 를 하드코딩 — 이미지 AI
 *      경로만 생성기를 불렀다. 실도면 4건 전부 제안 0건.
 *   2. 제안이 가리키는 계산기 ID 9개 중 5개가 레지스트리에 없는 이름이었다.
 *      없던 이름 → 실재하는 이름으로 각각 옮겼다:
 *        transformer-sizing        → transformer-capacity
 *        motor-starting            → starting-current
 *        power-factor-correction   → reactive-power
 *        demand-factor             → demand-diversity
 *        load-calculation          → max-demand
 *      같은 죽은 이름이 모바일·OCR 화면의 라벨 표와 지식그래프의 relatedCalc
 *      에도 퍼져 있었다. 눌러도 갈 곳이 없었다.
 *   3. 화면에 렌더 지점이 없었다. 페이지 헤더는 "확인이 필요한 계산 항목과
 *      HOLD 근거를 정리합니다" 라고 적혀 있었다.
 *
 * 여기서는 1·2를 잠근다(3은 렌더 존재 자체를 아래에서 문자열로 확인한다).
 */

import { readFileSync } from 'node:fs';
import { generateSuggestions } from '../sld-recognition';
import { CALCULATOR_PARAMS } from '../calculator-params';
import type { SLDComponent, SLDConnection } from '../sld-recognition';

function component(over: Partial<SLDComponent> & Pick<SLDComponent, 'id' | 'type'>): SLDComponent {
  return { position: { x: 0, y: 0 }, ...over } as SLDComponent;
}

describe('제안 계산기는 실재하는 계산기를 가리킨다', () => {
  it('생성 가능한 모든 제안의 calculatorId 가 레지스트리에 있다', () => {
    // 각 규칙이 한 번씩은 발화하도록 기기 종류를 모두 넣는다.
    const components: SLDComponent[] = [
      component({ id: 'tx1', type: 'transformer', rating: '1000kVA', voltage: '22.9kV' }),
      component({ id: 'brk1', type: 'breaker', current: '250A', voltage: '380V' }),
      component({ id: 'mot1', type: 'motor', rating: '55kW', voltage: '380V' }),
      component({ id: 'cap1', type: 'capacitor', rating: '100kVAR' }),
      component({ id: 'ld1', type: 'load', rating: '50kW' }),
      component({ id: 'ld2', type: 'load', rating: '30kW' }),
    ];
    const connections: SLDConnection[] = [
      { id: 'c1', from: 'tx1', to: 'brk1', length: '50m', conductorSize: '95sq', cableType: 'XLPE' },
    ];

    const suggestions = generateSuggestions({ components, connections });
    expect(suggestions.length).toBeGreaterThan(0);

    const unknown = suggestions
      .map((s) => s.calculatorId)
      .filter((id) => !(id in CALCULATOR_PARAMS));
    expect(unknown).toEqual([]);
  });
});

describe('벡터 경로도 같은 생성기를 쓴다', () => {
  // 규칙은 기기 종류만 보므로 추출 경로와 무관하다. 두 벌로 나뉘면 한쪽만
  // 고쳐지는 일이 반복되므로, 벡터 파서가 생성기를 호출하는지 배선을 확인한다.
  it.each([
    'src/engine/topology/pdf-vector-parser.ts',
    'src/engine/topology/dxf-parser.ts',
  ])('%s 가 generateSuggestions 를 호출한다', (path) => {
    const src = readFileSync(path, 'utf8');
    expect(src).toContain('generateSuggestions({ components');
  });

  it('차단기만 있는 도면에서도 제안이 나온다', () => {
    // 실도면(kimm-panelboard-sld.pdf)이 이 모양이다 — 패널·차단기·버스뿐이고
    // 변압기·부하가 없어 추천 계산 순서(calcChain)는 0단계다. 그렇다고 확인할
    // 항목이 없는 것은 아니다.
    const suggestions = generateSuggestions({
      components: [
        component({ id: 'p1', type: 'panel' }),
        component({ id: 'b1', type: 'breaker', current: '250A' }),
        component({ id: 'b2', type: 'breaker', current: '250A' }),
      ],
      connections: [],
    });
    expect(suggestions.map((s) => s.calculatorId)).toEqual(['breaker-sizing', 'breaker-sizing']);
  });
});

describe('화면 렌더', () => {
  it('SLD 페이지가 제안 목록을 렌더한다', () => {
    const src = readFileSync('src/app/(with-nav)/tools/sld/page.tsx', 'utf8');
    expect(src).toContain('확인이 필요한 계산 항목');
    expect(src).toContain('<SuggestedCalcs suggestions={analysis.suggestedCalculations} />');
  });
});
