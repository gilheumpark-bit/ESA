import { CALCULATOR_REGISTRY } from '../index';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';

/**
 * **단계 번호는 1 부터 빠짐없이, 겹치지 않게.**
 *
 * 화면은 이 번호로 «1단계 · 2단계» 를 그리고, 소비처는 번호로 값을 집는다.
 * 실측 2026-07-30: `busbar-vd` 가 구간마다 두 줄을 같은 번호로 밀어 넣어
 * `1, 1, 2, 2, 5` 를 냈다 — 겹친 번호의 뒤쪽(누적 %)은 번호로 접근이 안 되고,
 * 3·4 가 비어 단계가 빠진 것처럼 보였다. 값 앵커는 이걸 못 본다. 값은 다
 * 맞았기 때문이다.
 *
 * 입력은 `CALCULATOR_PARAMS` 선언에서 만든다 — 새 계산기도 자동으로 걸린다.
 */

type Param = { name: string; type: string; defaultValue?: unknown; min?: number; max?: number; options?: unknown[]; minItems?: number; flatten?: boolean; itemSchema?: Param[] };

function buildInput(params: Param[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) out[p.name] = buildValue(p);
  return out;
}

function buildValue(p: Param): unknown {
  if (p.defaultValue !== undefined) return p.defaultValue;
  if (p.options?.length) return p.options[0];
  if (p.type === 'number') {
    const lo = p.min ?? 1;
    const hi = p.max ?? lo * 1000;
    return Number.isFinite(hi) && hi > lo ? Number(((lo + hi) / 2).toPrecision(3)) : lo;
  }
  if (p.type === 'boolean') return true;
  if (p.type === 'array') {
    // 구간이 여럿일 때만 드러나는 결함이라 최소 2 개를 만든다.
    const n = Math.max(2, p.minItems ?? 2);
    const item = p.flatten
      ? buildValue(p.itemSchema?.[0] ?? { name: 'v', type: 'number' })
      : (p.itemSchema ? buildInput(p.itemSchema) : 1);
    return Array.from({ length: n }, () => item);
  }
  return 'test';
}

const ids = [...CALCULATOR_REGISTRY.keys()].filter((id) => (CALCULATOR_PARAMS as Record<string, Param[]>)[id]?.length);

const results = ids.map((id) => {
  try {
    const r = CALCULATOR_REGISTRY.get(id)!.calculator(
      buildInput((CALCULATOR_PARAMS as Record<string, Param[]>)[id]) as never,
    ) as { steps?: Array<{ step?: unknown }> };
    return { id, steps: (r.steps ?? []).map((s) => s?.step).filter((v): v is number => typeof v === 'number') };
  } catch {
    return { id, steps: [] as number[] };
  }
});

describe('단계 번호 계약', () => {
  it('단계를 내는 계산기가 실제로 있다 — 공회전 반증', () => {
    expect(results.filter((r) => r.steps.length > 0).length).toBeGreaterThan(40);
  });

  it('같은 번호를 두 번 쓰지 않는다', () => {
    const dup = results
      .filter((r) => new Set(r.steps).size !== r.steps.length)
      .map((r) => `${r.id}: [${r.steps.join(', ')}]`);
    expect(dup).toEqual([]);
  });

  it('1 부터 시작해 빠짐없이 이어진다', () => {
    const gaps = results
      .filter((r) => r.steps.length > 0)
      .filter((r) => {
        const sorted = [...r.steps].sort((a, b) => a - b);
        return sorted.some((v, i) => v !== i + 1);
      })
      .map((r) => `${r.id}: [${r.steps.join(', ')}]`);
    expect(gaps).toEqual([]);
  });

  /** 규칙이 실제로 걸러 내는지 — 조용히 0 건이면 영원히 초록이다. */
  it('탐지 규칙이 발화한다', () => {
    const dupCase = [1, 1, 2, 2, 5];
    expect(new Set(dupCase).size !== dupCase.length).toBe(true);
    const gapCase = [1, 2, 5];
    expect(gapCase.some((v, i) => v !== i + 1)).toBe(true);
    const ok = [1, 2, 3];
    expect(new Set(ok).size !== ok.length).toBe(false);
    expect(ok.some((v, i) => v !== i + 1)).toBe(false);
  });
});
