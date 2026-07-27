import { CALCULATOR_REGISTRY } from '../index';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';

/**
 * 계산기 전수를 **표준 없이도 참인 조건**으로 훑는다.
 *
 * 아크플래시에서 배운 형태다: 기존 테스트 8 개가 전부 방향성만 봐서
 * (`> 0` · `not.toEqual` · 단조성) 물리적으로 불가능한 아크 전류가
 * 280 점 중 189 점에서 통과하고 있었다. 값의 정확도는 표준 원문이 있어야
 * 보지만, **NaN 이 아닌가 · 무한대가 아닌가 · 음수일 수 없는 양이 음수인가**
 * 는 아무 표준 없이도 판정된다. 그런 것이 안 걸려 있었다.
 *
 * 입력은 각 계산기가 선언한 `CALCULATOR_PARAMS` 에서 만든다 — 손으로
 * 적으면 그 계산기만 보게 되고 새로 추가된 것은 영영 안 돈다.
 */

type Param = {
  name: string;
  type: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  options?: unknown[];
  minItems?: number;
  flatten?: boolean;
  itemSchema?: Param[];
};

/** 선언에서 그럴듯한 입력 하나를 만든다. */
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
    const hi = p.max ?? lo * 10;
    // 경계가 아니라 안쪽 값을 쓴다 — 경계는 검증 예외를 부르기 쉽다.
    return Number.isFinite(hi) && hi > lo ? Number(((lo + hi) / 2).toPrecision(3)) : lo;
  }
  if (p.type === 'boolean') return true;
  if (p.type === 'array') {
    const n = Math.max(1, p.minItems ?? 1);
    // `flatten: true` 는 화면이 itemSchema 를 펴서 스칼라 목록으로 보낸다는
    // 선언이다. 이걸 무시하면 계산기에 객체가 가서 던진다 — 앱이 아니라
    // 이 하네스가 틀린 것이었다.
    const item = p.flatten
      ? buildValue(p.itemSchema?.[0] ?? { name: 'v', type: 'number' })
      : (p.itemSchema ? buildInput(p.itemSchema) : 1);
    return Array.from({ length: n }, () => item);
  }
  return 'test';
}

/** 음수일 수 없는 물리량 — 이름으로 고른다. */
const NON_NEGATIVE = /current|voltage|power|energy|resistance|impedance|capacit|length|size|area|time|duration|count|number|distance|boundary|loss|drop|kva|kw|kvar|amp/i;

function numericOutputs(result: unknown): Array<{ path: string; value: number; unit?: string }> {
  const out: Array<{ path: string; value: number; unit?: string }> = [];
  if (!result || typeof result !== 'object') return out;
  const r = result as Record<string, unknown>;
  if (typeof r.value === 'number') out.push({ path: 'value', value: r.value, unit: String(r.unit ?? '') });
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number') out.push({ path: k, value: v });
  }
  const extra = r.additionalOutputs;
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra as Record<string, { value?: unknown; unit?: string }>)) {
      if (v && typeof v.value === 'number') out.push({ path: `additionalOutputs.${k}`, value: v.value, unit: v.unit });
    }
  }
  const steps = r.steps;
  if (Array.isArray(steps)) {
    steps.forEach((s, i) => {
      if (s && typeof s === 'object' && typeof (s as { value?: unknown }).value === 'number') {
        out.push({ path: `steps[${i}]`, value: (s as { value: number }).value, unit: (s as { unit?: string }).unit });
      }
    });
  }
  return out;
}

describe('계산기 전수 — 표준 없이도 참인 조건', () => {
  const ids = [...CALCULATOR_REGISTRY.keys()];

  it('계산기를 실제로 돈다', () => {
    expect(ids.length).toBeGreaterThan(50);
  });

  /** 선언이 없어 입력을 못 만드는 것 — 그 자체가 공백이라 드러낸다. */
  const runnable = ids.filter((id) => (CALCULATOR_PARAMS as Record<string, Param[]>)[id]?.length);

  it('모든 계산기가 입력 선언을 갖는다 — 없으면 화면이 폼을 못 그린다', () => {
    const missing = ids.filter((id) => !(CALCULATOR_PARAMS as Record<string, Param[]>)[id]?.length);
    expect(missing).toEqual([]);
  });

  const results = runnable.map((id) => {
    const params = (CALCULATOR_PARAMS as Record<string, Param[]>)[id];
    try {
      const entry = CALCULATOR_REGISTRY.get(id)!;
      return { id, result: entry.calculator(buildInput(params)) as unknown, error: null as string | null };
    } catch (e) {
      return { id, result: null, error: e instanceof Error ? e.message : String(e) };
    }
  });

  it('선언된 기본 입력으로 던지지 않는다 — 화면 기본값이 곧 이 값이다', () => {
    const threw = results.filter((r) => r.error).map((r) => `${r.id}: ${r.error?.slice(0, 90)}`);
    expect(threw).toEqual([]);
  });

  it('출력에 NaN·무한대가 없다', () => {
    const bad: string[] = [];
    for (const { id, result } of results) {
      if (!result) continue;
      for (const o of numericOutputs(result)) {
        if (!Number.isFinite(o.value)) bad.push(`${id}.${o.path} = ${o.value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('음수일 수 없는 물리량이 음수가 아니다', () => {
    const bad: string[] = [];
    for (const { id, result } of results) {
      if (!result) continue;
      for (const o of numericOutputs(result)) {
        // steps 는 중간 계산이라 부호가 뒤집힐 수 있다(예: 역률 보정 차이).
        if (o.path.startsWith('steps[')) continue;
        // 차분·마진은 음수가 뜻을 갖는다. 이름에 그렇게 적혀 있어야 넘어간다 —
        // `annualEnergySaving` 처럼 "절감" 이라 해 놓고 음수를 내면 그건
        // 이름이 틀린 것이라 여기서 걸려야 한다.
        if (/delta|difference|margin|diff|balance/i.test(o.path)) continue;
        if (!NON_NEGATIVE.test(o.path)) continue;
        if (o.value < 0) bad.push(`${id}.${o.path} = ${o.value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('백분율 출력이 물리 한계를 넘지 않는다 — 효율·역률은 100% 이하다', () => {
    const bad: string[] = [];
    for (const { id, result } of results) {
      if (!result) continue;
      for (const o of numericOutputs(result)) {
        if (o.unit !== '%') continue;
        if (!/efficiency|powerfactor|pf\b|효율|역률/i.test(`${id} ${o.path}`)) continue;
        if (o.value > 100) bad.push(`${id}.${o.path} = ${o.value}%`);
      }
    }
    expect(bad).toEqual([]);
  });
});
