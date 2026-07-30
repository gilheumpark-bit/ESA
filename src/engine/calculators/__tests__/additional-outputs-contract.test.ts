import { CALCULATOR_REGISTRY } from '../index';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';

/**
 * **부가 출력은 화면 단계와 같은 수를 말해야 한다.**
 *
 * `steps` 는 사용자가 보는 숫자, `additionalOutputs` 는 **다른 코드가 집어 가는
 * 숫자**다(리포트·도면 파이프라인·API 응답). 그런데 거의 모든 계산기가 같은
 * 양을 **두 곳에서 따로 계산해 따로 반올림**한다. 한쪽만 고치면 화면과 API 가
 * 어긋나는데, 그걸 볼 검사가 없었다 — 변이 훑기에서 부가 출력 73 줄이 전량
 * 무방비였다(실측 2026-07-30).
 *
 * 계산기마다 손으로 짝을 지어 봤더니 **3 건 중 2 건을 틀렸다**. `round` 없는
 * 단계에서 번호가 밀렸고, 잘못된 짝을 계약으로 굳힐 뻔했다. 그래서 짝을
 * 사람이 정하지 않는다 — **부가 출력 값이 단계 값 중 하나와 일치하는가**만
 * 본다. 어느 단계인지는 몰라도 된다.
 *
 * 이 계약이 잡는 것: 두 곳 중 **한쪽만** 바뀌는 것. 어느 쪽을 오염시켜도
 * 일치가 깨진다.
 * 이 계약이 못 잡는 것: 두 곳이 **같이** 틀리는 것. 그건 단계 쪽 절대 눈금
 * (`accuracy-known-answers.test.ts`)의 몫이다. 둘은 보완 관계다.
 *
 * 입력은 `universal-sanity` 와 같은 방식으로 `CALCULATOR_PARAMS` 선언에서
 * 만든다 — 손으로 적으면 새로 추가된 계산기는 영영 안 돈다.
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

/**
 * 입력을 **여러 벌** 만든다. 한 벌로는 계약이 구조적으로 못 보는 자리가 있다.
 *
 *   ① 퇴화 입력 — 상한 선언이 없는 수치는 `min × 10` 이 되는데, min 이 아주
 *      작으면 전류 0.055 A · 길이 0.55 m 같은 값이 나오고 전압강하가 0 으로
 *      반올림된다. **0 은 1.5 배를 곱해도 0** 이라 오염이 안 보인다
 *      (실측: 수치 부가출력 191 중 15 가 0).
 *   ② 미실행 가지 — 열거 파라미터에서 늘 첫 값만 쓰면 반대 방향 변환 같은
 *      가지가 한 번도 안 돈다(awg-to-mm2 만 돌고 mm2-to-awg 는 안 돌았다).
 *
 * 그래서 **자릿수를 키운 변형**과 **첫 열거 파라미터의 각 선택지**를 함께
 * 돌린다. 완전하지는 않다 — 열거가 둘 이상이면 조합을 다 돌지는 않는다.
 */
type Variant = { spread: number; enumIndex: number };

const VARIANTS: Variant[] = [
  { spread: 10, enumIndex: 0 },
  { spread: 1000, enumIndex: 0 },
  { spread: 1000, enumIndex: 1 },
  { spread: 1000, enumIndex: 2 },
];

function buildInput(params: Param[], v: Variant): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let enumSeen = false;
  for (const p of params) {
    // 첫 열거 파라미터만 선택지를 옮긴다 — 조합 폭발을 피한다.
    if (!enumSeen && p.options?.length && p.defaultValue === undefined) {
      enumSeen = true;
      out[p.name] = p.options[Math.min(v.enumIndex, p.options.length - 1)];
      continue;
    }
    out[p.name] = buildValue(p, v);
  }
  return out;
}

function buildValue(p: Param, v: Variant): unknown {
  if (p.defaultValue !== undefined) return p.defaultValue;
  if (p.options?.length) return p.options[0];
  if (p.type === 'number') {
    const lo = p.min ?? 1;
    const hi = p.max ?? lo * v.spread;
    // 경계가 아니라 안쪽 — 경계는 검증 예외를 부르기 쉽다.
    return Number.isFinite(hi) && hi > lo ? Number(((lo + hi) / 2).toPrecision(3)) : lo;
  }
  if (p.type === 'boolean') return true;
  if (p.type === 'array') {
    const n = Math.max(1, p.minItems ?? 1);
    const item = p.flatten
      ? buildValue(p.itemSchema?.[0] ?? { name: 'v', type: 'number' }, v)
      : (p.itemSchema ? buildInput(p.itemSchema, v) : 1);
    return Array.from({ length: n }, () => item);
  }
  return 'test';
}

/**
 * 단계에 짝이 없는 것이 정상인 부가 출력.
 *
 * **사유 없이 늘리지 말 것.** 여기 넣는 순간 그 값은 이 계약의 감시를
 * 벗어난다 — 늘려서 초록을 만들지 말고, 왜 짝이 없는지 적을 수 없으면
 * 계산기 쪽이 잘못된 것이다.
 */
const NO_STEP_TWIN: Record<string, Record<string, string>> = {
  // ── 같은 양인데 단위가 다르다. 이 계약은 단위 환산을 모른다.
  'three-phase-power': { apparentPower_kVA: '단계는 VA, 여기는 kVA — 1000 배 관계. 파생 계약에서 본다.' },

  // ── 단계가 없는 독립 출력. accuracy-known-answers 의 «파생 부가 출력» 에서
  //    관계식이나 절대 눈금으로 따로 잠근다.
  'reactive-power': {
    currentAngle: 'φ₁ = arccos(pf₁) — 단계에 각도가 없다. 절대 눈금 41.41° 로 잠금.',
    targetAngle: 'φ₂ = arccos(pf₂) — 위와 같다. 18.19°.',
  },
  'complex-voltage-drop': { receivingEndVoltage: 'V − 강하 를 인라인 계산 — 관계식으로 잠금.' },
  'busbar-vd': { receivingEndVoltage: '구간 누적 강하를 뺀 값을 인라인 계산 — 관계식으로 잠근다.' },
  'cable-sizing': {
    baseAmpacity: '허용전류 표 조회값 — 단계는 보정계수만 보여 준다.',
    correctedAmpacity: '표 조회 × 보정 — 관계식으로 잠금.',
  },
  'unit-converter': { ratio: '두 단위 사이 배율 — 단계는 변환 전후 값만.' },
  'ampacity-compare': { deratingFactor: '보정계수 곱 — 단계는 보정 전후 전류.' },
  'transformer-capacity': { utilization: '설계용량 / 선정용량 — 관계식으로 잠금.' },
  'parallel-operation': {
    loadShare_T1: '%Z 역비로 나눈 분담률 — 단계는 편차만.',
    loadShare_T2: '위와 같다. 둘의 합이 100 이어야 한다.',
  },
  'rcd-sizing': { breakTime: '감도별 동작시간 표값 — 단계에 없다.' },
  'ground-resistance': { suggestedRodCount: '목표 저항을 맞추는 봉 수 — 단계는 저항값.' },
  'energy-saving': {
    paybackPeriod: '투자비 / 연간 절감 — 투자비가 없으면 0.',
    reductionPercent: '(before − after) / before — 관계식으로 잠금.',
  },
  'ampacity-global-compare': { spreadPercent: '국가별 최대·최소 차 — 단계는 각국 값.' },
  'nec-load-calc': { selectedService: '표준 서비스 용량 선정 — 단계는 계산된 전류.' },

  // ── 수량이 아닌 것이 수치 필드에 들어 있다. 별개 결함이라 아래 검사에서
  //    따로 드러낸다(0/1 이나 분류 코드는 단계 값과 맞출 대상이 아니다).
  'grid-connect': { connectionType: '연계 방식 분류를 0/1 로 냄 — 수량 아님.' },
  'vt-sizing': { accuracyOk: '정확도 충족 여부를 0/1 로 냄 — 판정이지 수량 아님.' },
  'surge-arrester': { housingType: '외함 종류 분류를 0/1 로 냄 — 수량 아님.' },
};

/** 위 목록 중 «수량이 아닌 값» — 수치 출력에 섞여 있는 것 자체가 문제다. */
const NON_QUANTITY = ['grid-connect.connectionType', 'vt-sizing.accuracyOk', 'surge-arrester.housingType'];

/**
 * 같은 양인지 판정한다.
 *
 * 단계와 부가 출력이 서로 다른 자릿수로 반올림돼 있는 일이 흔하다
 * (`round(x, 2)` vs `round(x, 4)`). 그래서 **둘 중 더 거친 자릿수로 맞춰서**
 * 비교한다 — 상대오차 방식은 작은 값에서 1.5 배 오염을 통과시켜 버린다
 * (0.03 → 0.045 의 상대차가 임계 안에 든다).
 */
function decimals(v: number): number {
  const text = String(v);
  const dot = text.indexOf('.');
  return dot < 0 || text.includes('e') ? 0 : text.length - dot - 1;
}

function sameQuantity(a: number, b: number): boolean {
  if (a === b) return true;
  const digits = Math.min(decimals(a), decimals(b));
  return a.toFixed(digits) === b.toFixed(digits);
}

function matchesAnyStep(value: number, stepValues: number[]): boolean {
  return stepValues.some((s) => sameQuantity(s, value));
}

type CalcResult = {
  steps?: Array<{ value?: unknown }>;
  additionalOutputs?: Record<string, { value?: unknown }>;
};

const ids = [...CALCULATOR_REGISTRY.keys()];
const runnable = ids.filter((id) => (CALCULATOR_PARAMS as Record<string, Param[]>)[id]?.length);

const cases = runnable.flatMap((id) => {
  const params = (CALCULATOR_PARAMS as Record<string, Param[]>)[id];
  return VARIANTS.map((variant) => {
    const label = `spread ${variant.spread} · enum ${variant.enumIndex}`;
    try {
      const result = CALCULATOR_REGISTRY.get(id)!.calculator(buildInput(params, variant) as never) as CalcResult;
      return { id, label, result, error: null as string | null };
    } catch (e) {
      return { id, label, result: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
});

describe('부가 출력 ↔ 표시 단계 일치 계약', () => {
  it('계산기를 실제로 돈다 — 공회전 반증', () => {
    expect(runnable.length).toBeGreaterThan(50);
    expect(cases.length).toBe(runnable.length * VARIANTS.length);
    expect(cases.filter((c) => c.result).length).toBeGreaterThan(150);
  });

  it('부가 출력을 가진 계산기가 실제로 있다 — 검사 대상이 0 이면 이 파일은 무의미하다', () => {
    const withExtras = cases.filter((c) => {
      const extras = c.result?.additionalOutputs;
      return extras && Object.values(extras).some((v) => typeof v?.value === 'number');
    });
    expect(withExtras.length).toBeGreaterThan(20);
  });

  it('모든 부가 출력이 어떤 표시 단계와 같은 수를 말한다', () => {
    const mismatches: string[] = [];

    for (const { id, label, result } of cases) {
      if (!result) continue;
      const stepValues = (result.steps ?? [])
        .map((s) => s?.value)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const extras = result.additionalOutputs ?? {};

      for (const [key, entry] of Object.entries(extras)) {
        const value = entry?.value;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (NO_STEP_TWIN[id]?.[key]) continue;
        if (!matchesAnyStep(value, stepValues)) {
          mismatches.push(`${id}.${key} = ${value} (${label}) — 단계 값 [${stepValues.join(', ')}] 중 어느 것과도 다르다`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  /**
   * 규칙이 실제로 무언가를 걸러 내는지. 값을 흔들면 반드시 어긋나야 한다 —
   * 조용히 통과만 하면 이 계약은 영원히 초록이다(§2.2).
   */
  it('일치 판정이 발화한다', () => {
    expect(matchesAnyStep(100, [100, 200])).toBe(true);
    expect(matchesAnyStep(150, [100, 200])).toBe(false);
    // 1.5 배 오염은 반드시 걸려야 한다 — 큰 값에서도 작은 값에서도.
    expect(matchesAnyStep(100 * 1.5, [100])).toBe(false);
    expect(matchesAnyStep(0.03 * 1.5, [0.03])).toBe(false);
    // 반올림 자릿수 차이는 통과 — 거친 쪽에 맞춰 본다.
    expect(matchesAnyStep(1.2345, [1.23])).toBe(true);
    expect(matchesAnyStep(65817.93, [65817.9312])).toBe(true);
    // 단위가 다르면 같은 양이 아니다 — 이 계약은 단위 환산을 모른다.
    expect(matchesAnyStep(65.818, [65817.93])).toBe(false);
    // 0 끼리는 같고, 0 과 다른 값은 다르다.
    expect(matchesAnyStep(0, [0])).toBe(true);
    expect(matchesAnyStep(0, [1])).toBe(false);
  });

  /**
   * 면제 목록이 조용히 불어나지 않게 잠근다. 늘리려면 이 수를 같이 고쳐야
   * 하고, 그때 왜 짝이 없는지 사유를 적게 된다 — 잔여가 0 처럼 보이지 않게.
   */
  it('면제 수가 선언된 21 건을 넘지 않는다', () => {
    const declared = Object.entries(NO_STEP_TWIN).flatMap(([id, keys]) =>
      Object.keys(keys).map((k) => `${id}.${k}`));
    expect(declared).toHaveLength(21);
  });

  it('면제에는 전부 사유가 적혀 있다', () => {
    const blank = Object.entries(NO_STEP_TWIN).flatMap(([id, keys]) =>
      Object.entries(keys).filter(([, why]) => why.trim().length < 10).map(([k]) => `${id}.${k}`));
    expect(blank).toEqual([]);
  });

  /**
   * 수량이 아닌 값이 수치 출력에 섞여 있다 — 0/1 이나 분류 코드다.
   * 소비처는 이걸 숫자로 읽고, 화면은 단위 없는 수로 그린다.
   * 지금은 실측을 고정만 해 둔다(계산기 쪽 변경은 별건).
   */
  it('수량 아닌 부가 출력이 3 건 있다 — 늘어나면 드러난다', () => {
    expect(NON_QUANTITY).toHaveLength(3);
    for (const path of NON_QUANTITY) {
      const [id, key] = path.split('.');
      expect(NO_STEP_TWIN[id]?.[key]).toBeTruthy();
    }
  });
});
