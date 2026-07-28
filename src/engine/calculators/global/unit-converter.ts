/**
 * 전기 단위 환산 — SI 접두어와 같은 물리량 안에서만.
 *
 * 왜 계산기여야 하는가: 채팅 답변은 영수증 없는 수치를 지운다. 그래서
 * "0.4kV 는 몇 V 인가" 에 **"[미확인]입니다"** 가 나갔다(AI 품질 점검
 * 2026-07-28 실측). 모델은 400 을 알지만 앱이 그 숫자를 보증할 수 없어서
 * 지웠고, 보증할 계산기가 없었다.
 *
 * **다른 물리량 사이는 변환하지 않는다.** V → A 는 옴의 법칙이지 단위
 * 환산이 아니고, 저항이나 임피던스를 모르면 답이 없다. kW ↔ kVA 도
 * 역률이 있어야 한다. 그런 요청은 계산하지 않고 무엇이 더 필요한지 말한다
 * — 배수만 곱해 답을 내면 그게 이 앱이 막으려는 바로 그 실수다.
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { DetailedCalcResult, CalcStep, round } from '../types';

// ── 물리량과 배수 ────────────────────────────────────────────────────────────

/** 같은 열 안에서만 환산한다. 열이 다르면 거부한다. */
type Quantity = 'voltage' | 'current' | 'power' | 'apparentPower' | 'reactivePower'
  | 'resistance' | 'frequency' | 'length' | 'energy';

interface UnitDef {
  /** 기준 단위에 대한 배수 (V·A·W·VA·var·Ω·Hz·m·Wh) */
  factor: number;
  quantity: Quantity;
  /** 화면·답변에 쓸 표기 */
  label: string;
}

/**
 * 키는 정규화된 소문자다. 도면·현장 표기의 흔들림(㎸·kv·KV)은
 * `normalizeUnit` 이 흡수한다.
 */
const UNITS: Record<string, UnitDef> = {
  // 전압
  v: { factor: 1, quantity: 'voltage', label: 'V' },
  mv: { factor: 1e-3, quantity: 'voltage', label: 'mV' },
  kv: { factor: 1e3, quantity: 'voltage', label: 'kV' },
  // 전류
  a: { factor: 1, quantity: 'current', label: 'A' },
  ma: { factor: 1e-3, quantity: 'current', label: 'mA' },
  ka: { factor: 1e3, quantity: 'current', label: 'kA' },
  // 유효전력
  w: { factor: 1, quantity: 'power', label: 'W' },
  kw: { factor: 1e3, quantity: 'power', label: 'kW' },
  mw: { factor: 1e6, quantity: 'power', label: 'MW' },
  // 피상전력
  va: { factor: 1, quantity: 'apparentPower', label: 'VA' },
  kva: { factor: 1e3, quantity: 'apparentPower', label: 'kVA' },
  mva: { factor: 1e6, quantity: 'apparentPower', label: 'MVA' },
  // 무효전력
  var: { factor: 1, quantity: 'reactivePower', label: 'var' },
  kvar: { factor: 1e3, quantity: 'reactivePower', label: 'kvar' },
  mvar: { factor: 1e6, quantity: 'reactivePower', label: 'Mvar' },
  // 저항
  ohm: { factor: 1, quantity: 'resistance', label: 'Ω' },
  mohm: { factor: 1e-3, quantity: 'resistance', label: 'mΩ' },
  kohm: { factor: 1e3, quantity: 'resistance', label: 'kΩ' },
  // 주파수
  hz: { factor: 1, quantity: 'frequency', label: 'Hz' },
  khz: { factor: 1e3, quantity: 'frequency', label: 'kHz' },
  // 길이
  mm: { factor: 1e-3, quantity: 'length', label: 'mm' },
  m: { factor: 1, quantity: 'length', label: 'm' },
  km: { factor: 1e3, quantity: 'length', label: 'km' },
  // 전력량
  wh: { factor: 1, quantity: 'energy', label: 'Wh' },
  kwh: { factor: 1e3, quantity: 'energy', label: 'kWh' },
  mwh: { factor: 1e6, quantity: 'energy', label: 'MWh' },
};

/** 물리량이 다를 때, 무엇이 더 있어야 넘어갈 수 있는지. */
const BRIDGE_HINT: Partial<Record<`${Quantity}->${Quantity}`, string>> = {
  'power->apparentPower': '역률(cos φ)이 있어야 합니다 — kVA = kW / cos φ',
  'apparentPower->power': '역률(cos φ)이 있어야 합니다 — kW = kVA × cos φ',
  'voltage->current': '저항 또는 임피던스가 있어야 합니다 — 옴의 법칙(I = V / Z)',
  'current->voltage': '저항 또는 임피던스가 있어야 합니다 — 옴의 법칙(V = I × Z)',
  'apparentPower->current': '전압과 상수(단상/3상)가 있어야 합니다 — I = kVA×1000/(√3×V)',
  'power->current': '전압·역률·상수가 있어야 합니다',
};

const QUANTITY_LABEL: Record<Quantity, string> = {
  voltage: '전압', current: '전류', power: '유효전력', apparentPower: '피상전력',
  reactivePower: '무효전력', resistance: '저항', frequency: '주파수',
  length: '길이', energy: '전력량',
};

/**
 * 표기 흔들림을 흡수한다. 도면·현장에서 `㎸`·`KV`·`kΩ`·`Ω` 가 섞여 온다.
 *
 * 소문자화하면 `m` 접두어의 밀리와 메가가 한 글자로 뭉친다. 이 도메인에서는
 * 갈리지 않는다 — `mV`·`mA`·`mΩ`·`mm` 은 밀리로만 쓰고, `MW`·`MVA`·`Mvar`·
 * `MWh` 는 메가로만 쓴다. 밀리와트나 밀리볼트암페어는 전력 설비에 없다.
 * 그래서 표에 뜻을 하나씩만 넣고 소문자 키로 찾는다.
 */
export function normalizeUnit(raw: string): string | null {
  const key = raw
    .trim()
    .replace(/㎸/g, 'kV')
    .replace(/㎃/g, 'mA').replace(/㎾/g, 'kW').replace(/㎿/g, 'MW')
    .replace(/[Ωω]/g, 'ohm')
    .replace(/\s+/g, '')
    .toLowerCase();
  return key in UNITS ? key : null;
}

export interface UnitConverterInput {
  value: number;
  fromUnit: string;
  toUnit: string;
}

export function convertUnit(input: UnitConverterInput): DetailedCalcResult {
  const { value } = input;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('변환할 값이 숫자가 아닙니다.');
  }

  const fromKey = resolveKey(input.fromUnit);
  const toKey = resolveKey(input.toUnit);
  if (!fromKey) throw new Error(`알 수 없는 단위입니다: ${input.fromUnit}`);
  if (!toKey) throw new Error(`알 수 없는 단위입니다: ${input.toUnit}`);

  const from = UNITS[fromKey];
  const to = UNITS[toKey];

  // 물리량이 다르면 **계산하지 않는다.** 배수만 곱해 답을 내면 그게
  // 이 앱이 막으려는 실수다.
  if (from.quantity !== to.quantity) {
    const hint = BRIDGE_HINT[`${from.quantity}->${to.quantity}` as keyof typeof BRIDGE_HINT];
    const steps: CalcStep[] = [{
      step: 1,
      title: '물리량 확인',
      formula: `${QUANTITY_LABEL[from.quantity]} \\neq ${QUANTITY_LABEL[to.quantity]}`,
      value: 0,
      unit: '',
    }];
    return {
      value: 0,
      unit: to.label,
      formula: '단위 환산 불가',
      steps,
      source: [createSource('IEC', '80000-6', { edition: '2022' })],
      judgment: createJudgment(
        false,
        `${from.label}(${QUANTITY_LABEL[from.quantity]}) 에서 ${to.label}(${QUANTITY_LABEL[to.quantity]}) 로는 단위 환산만으로 갈 수 없습니다.`
        + (hint ? ` ${hint}` : ' 두 값을 잇는 물리 관계와 그 입력이 필요합니다.'),
        'error',
      ),
      // 물리량 이름은 문자열이라 `additionalOutputs`(숫자 전용)에 못 싣는다.
      // 판정문에 이미 적혀 있고, 그게 사용자가 읽는 자리다.
    };
  }

  const ratio = from.factor / to.factor;
  const converted = value * ratio;
  const steps: CalcStep[] = [
    {
      step: 1,
      title: '기준 단위로',
      formula: `x_{base} = ${value} \\times ${from.factor}`,
      value: round(value * from.factor, 9),
      unit: baseLabel(from.quantity),
    },
    {
      step: 2,
      title: '목표 단위로',
      formula: `x_{out} = x_{base} / ${to.factor}`,
      value: round(converted, 9),
      unit: to.label,
    },
  ];

  return {
    value: round(converted, 9),
    unit: to.label,
    formula: `x_{${to.label}} = x_{${from.label}} \\times \\frac{${from.factor}}{${to.factor}}`,
    steps,
    source: [createSource('IEC', '80000-6', { edition: '2022' })],
    judgment: createJudgment(
      true,
      `${value} ${from.label} = ${round(converted, 9)} ${to.label} (${QUANTITY_LABEL[from.quantity]})`,
      'info',
    ),
    additionalOutputs: {
      ratio: { value: round(ratio, 9), unit: '' },
    },
  };
}

function resolveKey(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const direct = normalizeUnit(raw);
  return direct;
}

function baseLabel(q: Quantity): string {
  const base: Record<Quantity, string> = {
    voltage: 'V', current: 'A', power: 'W', apparentPower: 'VA',
    reactivePower: 'var', resistance: 'Ω', frequency: 'Hz', length: 'm', energy: 'Wh',
  };
  return base[q];
}

/** 어떤 단위를 아는지 화면·검사가 물어볼 수 있게 연다. */
export const SUPPORTED_UNITS: readonly string[] = Object.values(UNITS).map((u) => u.label);
