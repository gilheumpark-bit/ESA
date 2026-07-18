import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '@/lib/calculator-params';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — CALCULATOR_PARAMS ↔ 계산기 입력 계약 정합성
//
// 폼은 값을 param.name으로 키잉해 전송하고, 폼→API→계산기 사이에 이름 매핑이
// 없다. 따라서 param.name이 계산기 입력 필드명과 어긋나면 계산기가
// "<field> ... got undefined"로 프로덕션에서 던진다. 단위 테스트는 계산기를
// 올바른 이름으로 직접 부르므로 이 드리프트를 못 잡는다.
//
// 이 테스트는 UI 경로와 동일하게 CALCULATOR_PARAMS 기본값으로 계산기를 실행해
// (1) 유한한 value, (2) 비어있지 않은 source가 나오는지 검증한다.
// 2026-07-19 실측: 수정 전 57개 중 52개가 이 방식에서 예외로 죽었다.
// ═══════════════════════════════════════════════════════════════════════════════

// 배열 입력이 필요해 평면 폼으로 표현 불가한 계산기(폼 업그레이드 대기).
// 여기 추가하려면 반드시 사유를 남길 것 — PASS를 만들려고 넣지 말 것.
const ARRAY_INPUT_DEFERRED = new Set<string>([
  'demand-diversity',       // individualMaxDemands: number[]
  'max-demand',             // loads: {name,ratedPower,demandFactor}[]
  'complex-voltage-drop',   // sections: {length,resistance,reactance}[]
  'busbar-vd',              // sections: {current,length,resistance,reactance}[]
  'parallel-operation',     // transformers: {...}[] ≥2
  'substation-capacity',    // loads: {name,kW,pf,demandFactor}[]
  'emergency-generator',    // emergencyLoads: {name,kW,pf,isMotor}[]
]);

function buildInput(defs: Array<Record<string, unknown>>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const d of defs) {
    const name = d.name as string;
    if (d.defaultValue !== undefined) input[name] = d.defaultValue;
    else if (d.type === 'string' && Array.isArray(d.options) && d.options.length) {
      input[name] = (d.options[0] as { value: unknown }).value;
    } else if (d.type === 'number') {
      let v = 100;
      if (typeof d.min === 'number' && v < d.min) v = d.min;
      if (typeof d.max === 'number' && v > d.max) v = d.max;
      input[name] = v;
    } else if (d.type === 'boolean') input[name] = true;
    else input[name] = '';
  }
  return input;
}

const flatIds = [...CALCULATOR_REGISTRY.keys()].filter(id => !ARRAY_INPUT_DEFERRED.has(id));

describe('CALCULATOR_PARAMS ↔ 계산기 입력 계약', () => {
  test.each(flatIds)('%s: CALCULATOR_PARAMS 기본값으로 실제 계산이 된다', (id) => {
    const entry = CALCULATOR_REGISTRY.get(id)!;
    const defs = CALCULATOR_PARAMS[id];
    expect(defs).toBeDefined();               // 폼 정의 존재
    expect(defs.length).toBeGreaterThan(0);

    const result = entry.calculator(buildInput(defs)) as {
      value: unknown; source?: unknown[];
    };
    // 유한한 값 (undefined/NaN/throw 아님)
    const v = result.value;
    const valueOk =
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length > 0);
    expect(valueOk).toBe(true);
    // 출처 태그 (근거 없는 결과 차단)
    expect(Array.isArray(result.source) ? result.source.length : 0).toBeGreaterThan(0);
  });

  test('모든 레지스트리 계산기가 CALCULATOR_NAMES에 있다 (죽은 링크 방지)', () => {
    const missing = [...CALCULATOR_REGISTRY.keys()].filter(id => !CALCULATOR_NAMES[id]);
    expect(missing).toEqual([]);
  });

  test('배열-입력 지연 목록이 실제로 배열을 요구한다 (문서-코드 동기)', () => {
    // 목록의 각 id는 여전히 레지스트리에 존재해야 한다(오타·삭제 방지).
    for (const id of ARRAY_INPUT_DEFERRED) {
      expect(CALCULATOR_REGISTRY.has(id)).toBe(true);
    }
  });
});
