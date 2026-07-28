import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';
import { CalcValidationError } from '../types';

/**
 * **422 가 짚는 칸이 화면에 실제로 있는가.**
 *
 * 계산 경로의 거부를 `CalcValidationError(field, …)` 로 바꾼 목적은 화면이
 * *그 칸*을 짚게 하는 것이다. 그런데 `field` 가 폼에 없는 이름이면 아무 칸도
 * 안 짚거나 — 더 나쁘게 — 멀쩡한 칸이 빨개진다.
 *
 * 실측 2026-07-28(독립 심사 백엔드 좌석):
 *   `emergency-generator` 가 `'loads'` 를 던지는데 폼 필드는 `emergencyLoads`
 *   `ampacity-compare` 가 `'cableSize'` 를 던지는데 실제 원인은 `ambientTemp`
 *
 * 이름은 손으로 못 지킨다 — 폼과 계산기가 다른 파일이고 둘 다 자유 문자열이다.
 * 그래서 **돌려서** 본다. 소스를 훑지 않고 계산기를 실제로 호출해 나온
 * `field` 를 `CALCULATOR_PARAMS` 와 대조한다.
 */

/** 그 계산기의 폼이 가진 칸 이름 — 배열 항목의 하위 칸까지 센다. */
function formFields(id: string): Set<string> {
  const out = new Set<string>();
  for (const p of CALCULATOR_PARAMS[id] ?? []) {
    out.add(p.name);
    for (const sub of (p as { itemSchema?: Array<{ name: string }> }).itemSchema ?? []) {
      out.add(sub.name);
      out.add(`${p.name}.${sub.name}`);
    }
  }
  return out;
}

/**
 * 거부를 유도하는 입력들. 전부를 유도할 수는 없고 그럴 필요도 없다 —
 * 하나라도 던지면 그 자리의 `field` 를 검사할 수 있다.
 */
function provocations(id: string): Array<Record<string, unknown>> {
  const params = CALCULATOR_PARAMS[id] ?? [];
  const valid: Record<string, unknown> = {};
  for (const p of params) {
    if (p.defaultValue !== undefined) valid[p.name] = p.defaultValue;
    else if (p.type === 'array') valid[p.name] = [];
  }
  const cases: Array<Record<string, unknown>> = [{}, { ...valid }];
  // 칸마다 하나씩 망가뜨린다 — 나머지는 기본값이라 그 칸만 원인이 된다.
  for (const p of params) {
    if (p.type === 'number') {
      cases.push({ ...valid, [p.name]: -1 }, { ...valid, [p.name]: 1e12 });
    } else if (p.type === 'array') {
      cases.push({ ...valid, [p.name]: [] });
    } else {
      cases.push({ ...valid, [p.name]: '___없는값___' });
    }
  }
  return cases;
}

describe('422 의 field 는 화면에 있는 칸이다', () => {
  const ids = [...CALCULATOR_REGISTRY.keys()].filter((id) => CALCULATOR_PARAMS[id]?.length);

  it('훑는 계산기가 있다 — 공회전 아님', () => {
    expect(ids.length).toBeGreaterThan(30);
  });

  /** 실제로 몇 자리를 봤는지 — 0 이면 위반 0 은 "깨끗해서" 가 아니라 "안 봐서" 다. */
  const observed: string[] = [];
  const offenders: string[] = [];

  it.each(ids)('%s', (id) => {
    const fields = formFields(id);
    const entry = CALCULATOR_REGISTRY.get(id)!;
    for (const inputs of provocations(id)) {
      let thrown: unknown = null;
      try {
        entry.calculator(inputs as never);
      } catch (e) {
        thrown = e;
      }
      if (!(thrown instanceof CalcValidationError)) continue;
      const f = thrown.field;
      if (!f) continue;
      observed.push(`${id}:${f}`);
      // 배열 항목 안의 칸은 `loads[0].kW` 처럼 첨자가 붙어 올 수 있다.
      const bare = f.replace(/\[\d+\]/g, '');
      if (!fields.has(bare) && !fields.has(bare.split('.').pop()!)) {
        offenders.push(`${id}: field='${f}' — 폼 칸: ${[...fields].join(', ')}`);
      }
    }
    expect(offenders.filter((o) => o.startsWith(`${id}:`))).toEqual([]);
  });

  it('훑기가 실제로 거부에 닿았다 — 공회전 알람', () => {
    // 위 it.each 가 먼저 돈다(jest 는 describe 안 it 을 선언 순서대로 실행).
    expect(observed.length).toBeGreaterThan(20);
  });
});
