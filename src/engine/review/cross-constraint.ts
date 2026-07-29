import type { SLDComponent } from '@/lib/sld-recognition';
import { parseSpecText, type ParsedSpec } from '@/engine/topology/spec-text';

/**
 * **못 읽은 값을 옆 기기가 구속한다.**
 *
 * 도면에는 중복 정보가 있다. 변압기 용량을 못 읽어도 2 차측 주차단기 정격이
 * 그 값을 좁힌다 — 기술사가 흐린 도면을 받았을 때 하는 일이고, 지금까지 이
 * 제품은 하지 않았다.
 *
 * 왜 필요한가(실측): 스캔 도면에서 500kVA 변압기를 300kVA 로 읽었다. 같은
 * 도면에 2 차측 ACB 2000A/380V 가 함께 적혀 있었다. 300kVA 는 2 차 정격
 * 456A 라 2000A 차단기와 4 배 어긋난다 — **읽은 값들끼리 이미 모순**이었는데
 * 아무도 대조하지 않았다.
 *
 * 이 층이 하는 것은 판정이 아니라 **구속**이다. "틀렸다" 가 아니라
 * "이 값은 다른 기기와 맞지 않고, 그것들로 보면 이 범위다" 를 말한다.
 * 확정은 여전히 사람이 한다.
 */

export interface Constraint {
  /** 무엇에 대한 구속인가 — 부품 id. */
  componentId: string;
  /** 사람이 읽는 항목 이름. */
  subject: string;
  /** 도면에서 읽은 값(없으면 미기재). */
  readValue: string | null;
  /** 구속으로 좁혀진 범위. */
  impliedMin: number;
  impliedMax: number;
  unit: string;
  /** 읽은 값이 그 범위 안인가. `null` = 읽은 값이 없어 판정 불가. */
  consistent: boolean | null;
  /** 무엇을 근거로 좁혔는지 — 사람이 검증할 수 있게. */
  basis: string;
  /** 다음에 무엇을 하면 되는지. */
  advice: string;
}

const SQRT3 = 1.7320508075688772;

/** 국내 배전 변압기 표준 용량(kVA) — KS C 4306 계열 상용 값. */
const STANDARD_KVA = [
  50, 75, 100, 150, 200, 300, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000,
];

function nearestStandardKva(v: number): number {
  return STANDARD_KVA.reduce((best, k) => (Math.abs(k - v) < Math.abs(best - v) ? k : best), STANDARD_KVA[0]);
}

function specOf(c: SLDComponent): ParsedSpec {
  return parseSpecText([c.label, c.rating, c.current, c.voltage].filter(Boolean).join(' '));
}

/**
 * 피상전력(kVA)만 돌려준다.
 *
 * **kW 를 kVA 로 쓰지 않는다.** 역률을 모르면 둘은 다른 양이고, 0.8 을
 * 가정하면 그 가정이 결론이 된다(무발명). MVA 만 kVA 로 환산한다.
 */
function apparentKva(spec: ParsedSpec): number | null {
  if (spec.power === undefined) return null;
  const unit = (spec.powerUnit ?? '').toLowerCase();
  if (unit === 'kva') return spec.power;
  if (unit === 'mva') return spec.power * 1000;
  return null;
}

/** 차단기 정격전류 — AT(트립)가 있으면 그것이 정본이다. */
function ratedCurrentA(spec: ParsedSpec): number | null {
  return spec.tripA ?? spec.current ?? null;
}

/**
 * 변압기 용량을 2 차측 차단기 정격으로 구속한다.
 *
 * `S = √3 · V₂ · I₂ / 1000` 이고, 주차단기는 정격 전류 이상이어야 하므로
 * 차단기 정격은 2 차 정격전류의 **하한**을 준다. 상한은 관행적 여유로 둔다 —
 * 차단기를 정격의 3 배 이상으로 키우는 설계는 보호 협조가 성립하지 않는다.
 *
 * 이 계산은 **도면에서 읽은 값만** 쓴다. 전압이 없으면 구속하지 않는다
 * (무발명 — 380V 로 가정하면 그 가정이 결론이 된다).
 */
function constrainTransformerByBreaker(
  tr: SLDComponent,
  breaker: SLDComponent,
): Constraint | null {
  const brSpec = specOf(breaker);
  const breakerA = ratedCurrentA(brSpec);
  const secondaryV = brSpec.voltage;
  if (!breakerA || !secondaryV || secondaryV <= 0) return null;

  // 차단기 정격 = 2차 정격전류의 1.0 ~ 3.0 배 구간으로 본다.
  const kvaAtBreakerRating = (SQRT3 * secondaryV * breakerA) / 1000;
  const impliedMin = kvaAtBreakerRating / 3.0;
  const impliedMax = kvaAtBreakerRating;

  const trSpec = specOf(tr);
  const readKva = apparentKva(trSpec);

  const consistent = readKva === null ? null
    : readKva >= impliedMin * 0.9 && readKva <= impliedMax * 1.1;

  const likely = nearestStandardKva((impliedMin + impliedMax) / 2);

  return {
    componentId: tr.id,
    subject: `${tr.label ?? tr.id} 변압기 용량`,
    readValue: readKva === null ? null : `${readKva}kVA`,
    impliedMin: Math.round(impliedMin),
    impliedMax: Math.round(impliedMax),
    unit: 'kVA',
    consistent,
    basis: `2차측 ${breaker.label ?? breaker.id} 차단기 ${breakerA}A · ${secondaryV}V 3상 기준`
      + ` — 정격전류 대비 차단기 1.0~3.0배 구간으로 환산`,
    advice: consistent === false
      ? `도면에서 읽은 ${readKva}kVA 는 이 범위 밖입니다.`
        + ` 두 값 중 하나를 잘못 읽었을 가능성이 큽니다 — 표준 용량으로는 ${likely}kVA 급이 유력합니다.`
        + ` 변압기 명판과 차단기 정격을 원본에서 다시 확인하십시오.`
      : consistent === null
        ? `용량이 도면에서 읽히지 않았습니다. 차단기 정격으로 보면 ${impliedMin.toFixed(0)}~${impliedMax.toFixed(0)}kVA,`
          + ` 표준 용량으로는 ${likely}kVA 급입니다. 확정하려면 명판 표기가 필요합니다.`
        : `읽은 값이 차단기 정격과 정합합니다.`,
  };
}

/**
 * 부품 목록에서 상호 구속을 뽑는다.
 *
 * 짝짓기는 보수적으로 한다 — 변압기가 하나고 2 차측 차단기 후보가 하나일
 * 때만 맺는다. 여럿이면 어느 것이 어느 변압기의 2 차인지 도면 연결 없이
 * 단정할 수 없고, 잘못 맺은 구속은 없는 것만 못하다.
 */
export function deriveConstraints(components: SLDComponent[]): Constraint[] {
  const out: Constraint[] = [];

  const transformers = components.filter((c) => c.type === 'transformer');
  // 2차 주차단기 후보 — 저압(<1kV) 정격을 가진 차단기.
  const lvBreakers = components.filter((c) => {
    if (c.type !== 'breaker') return false;
    const s = specOf(c);
    const v = s.voltage;
    const a = ratedCurrentA(s);
    return !!v && !!a && v < 1000;
  });

  if (transformers.length === 1 && lvBreakers.length === 1) {
    const c = constrainTransformerByBreaker(transformers[0], lvBreakers[0]);
    if (c) out.push(c);
  }

  return out;
}

/**
 * 구속을 사람이 읽는 문단으로. **거절이 아니라 분석**이다.
 *
 * 지금까지 품질이 나쁘면 "확정하지 마십시오" 로 끝났다. 그건 판정을 사용자
 * 에게 떠넘긴 것이다 — 도면을 들고 온 사람은 답을 알려고 온 것이지 경고를
 * 받으려고 온 게 아니다. 읽은 것으로 갈 수 있는 데까지 가고, 못 가는 지점을
 * 정확히 짚고, 무엇 하나만 확인하면 되는지 말한다.
 */
export function describeConstraints(constraints: Constraint[]): string[] {
  return constraints.map((c) => {
    const head = c.consistent === false ? `⚠ ${c.subject} — 다른 기기와 맞지 않습니다`
      : c.consistent === null ? `${c.subject} — 도면에서 읽히지 않았습니다`
        : `${c.subject} — 정합`;
    return `${head}\n  근거: ${c.basis}\n  ${c.advice}`;
  });
}
