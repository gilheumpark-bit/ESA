/**
 * 기기 어휘의 **유일한 정본**. 날 문자열의 철자를 아는 곳은 여기뿐이다.
 *
 * ## 왜 이 파일이 있는가
 *
 * 2026-08-07 진단(VALIDATION_EVIDENCE 31차): 영수증 전체에서 모델이 실제로 낸
 * 타입 문자열은 **52종 614회**인데 실제 기기 종류는 그 절반도 안 됐다.
 *
 *   CT      current_transformer · ct · currentTransformer ·
 *           zero_sequence_current_transformer · zero_phase_current_transformer
 *   피뢰기  surge_arrester · arrester · surgeArrester · lightning_arrester · surge_absorber
 *   PT/VT   instrument_transformer · vt_pt · potential_transformer ·
 *           potentialTransformer · voltage_transformer · vt
 *   MOF     metering_out_fit · metering_outfit · mof   ← 앞의 둘은 각각 1회씩
 *
 * 모델이 회차마다 철자를 새로 짓는다. 그런데 이 열린 어휘를 **8개의 독립 함수가
 * 각자 정규화**하고 있었고, 이번 세션에 찾은 결함이 전부 "그중 하나가 52개 철자
 * 중 하나를 빠뜨림" 이었다.
 *
 *   24차  instrument_transformer 를 count-register 가 빠뜨림 → 계기용변성기가 전력변압기로
 *   26차  `current transformer`(공백형)을 count-register 가 빠뜨림 → CT 가 전력변압기로
 *   29차  lightning_arrester·disconnecting_switch 를 채점기가 빠뜨림 → 골든 축 0
 *   30차  AMBIGUOUS_LINE_ENDPOINT 를 orchestrator 사설 정규식이 오분류 → 전면 판독 폐기
 *
 * 별칭을 더 넣는 방식은 수렴하지 않는다. 비용이 **철자 × 소비자**이고 철자는
 * 회차마다 늘어나기 때문이다.
 *
 * ## 두 층인 이유
 *
 * 첫 판은 `VCB`·`ACB`·`MCCB` 를 전부 `breaker` 로 접었다가 **도메인이 필요로 하는
 * 구분을 없앴다.** 진공·기중·배선용 차단기는 엔지니어에게 다른 기기다. 그래서
 * 어휘를 둘로 나눈다.
 *
 *   `DeviceType`    정본 세부 종류 — `breaker_vcb`, `current_transformer`
 *   `DeviceFamily`  판정용 계열   — `breaker`, `instrument_transformer`
 *
 * 세부는 보존해 보고서에 쓰고, 계열은 병합·골든 축 판정에 쓴다. 종전에 두 개념이
 * 한 문자열에 섞여 있어서 "VCB 와 ACB 가 타입이 달라 병합되지 않는" 일과
 * "CT 가 transformer 에 합산되는" 일이 동시에 일어났다.
 *
 * ## 채점기와의 공유
 *
 * 채점기(`scripts/lib/local-drawing-receipt.mjs`)는 별도 런타임이라 이 파일을
 * import 하지 못한다. 그래서 **파일이 아니라 값이 공유되게** 했다 —
 * `spatial-graph` 가 그래프 입구에서 정본화하므로 저장 문서의 `typeCandidates`
 * 자체가 이미 닫힌 어휘다. 채점기는 날 문자열을 볼 일이 없다.
 */

/** 정본 세부 종류. 이 목록 밖의 값은 존재하지 않는다. */
export const DEVICE_TYPES = [
  // 개폐·보호 — 세부 종류를 보존한다(진공·기중·배선용은 다른 기기다)
  'breaker', 'breaker_vcb', 'breaker_acb', 'breaker_mccb', 'breaker_mcb',
  'breaker_elcb', 'breaker_gcb', 'breaker_ocb',
  'switch', 'switch_disconnector', 'switch_load_break', 'switch_transfer',
  'fuse', 'cutout_switch',
  // 변압기류 — 전력용과 계기용을 반드시 가른다(24차 결함의 자리)
  'transformer', 'transformer_winding',
  'current_transformer', 'zero_sequence_ct',
  'voltage_transformer', 'ground_potential_transformer',
  'instrument_transformer', 'metering_outfit',
  // 계측·보호계전
  'meter', 'ammeter', 'voltmeter', 'relay', 'coil',
  // 서지 보호
  'arrester',
  // 수동 소자
  'capacitor', 'reactor', 'resistor', 'shunt', 'battery', 'rectifier', 'converter',
  // 구조·결선
  'busbar', 'cable', 'cable_head', 'terminal', 'ground', 'panel',
  // 전원·부하
  'source', 'generator', 'load', 'motor', 'lamp',
  // 기기가 아닌 것
  'annotation', 'other',
] as const;

export type DeviceType = typeof DEVICE_TYPES[number];

/**
 * 판정용 계열. 병합과 골든 축은 여기서 본다 — `breaker_vcb` 와 `breaker_acb` 는
 * 같은 글리프의 판독 차이지 다른 기기가 아니므로 병합되어야 한다.
 */
export type DeviceFamily =
  | 'breaker' | 'switch' | 'fuse' | 'transformer' | 'instrument_transformer'
  | 'meter' | 'relay' | 'arrester' | 'passive' | 'structure'
  | 'source' | 'load' | 'annotation' | 'other';

const KNOWN = new Set<string>(DEVICE_TYPES);

/**
 * 철자 차이를 없앤다. 영숫자만 남기므로 `current_transformer` ·
 * `current transformer` · `currentTransformer` · `CURRENT-TRANSFORMER` 가
 * 모두 `currenttransformer` 한 토큰이 된다.
 *
 * **이것이 별칭 목록보다 중요하다** — 목록은 못 본 철자를 놓치지만 규칙은 안 놓친다.
 * 24·26차 결함이 이 한 줄로 재발 불가능해진다.
 */
export function flattenTypeToken(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** 평탄 토큰 → 정본 세부 종류. 실측 52종과 코드에 흩어져 있던 별칭을 모두 담는다. */
const ALIASES = new Map<string, DeviceType>(Object.entries({
  // ── 차단기 (세부 보존)
  breaker: 'breaker', circuitbreaker: 'breaker', cb: 'breaker',
  vcb: 'breaker_vcb', breakervcb: 'breaker_vcb', vacuumcircuitbreaker: 'breaker_vcb',
  acb: 'breaker_acb', breakeracb: 'breaker_acb', aircircuitbreaker: 'breaker_acb',
  mccb: 'breaker_mccb', breakermccb: 'breaker_mccb',
  mcb: 'breaker_mcb', breakermcb: 'breaker_mcb',
  elcb: 'breaker_elcb', elb: 'breaker_elcb', rcd: 'breaker_elcb',
  gfci: 'breaker_elcb', afci: 'breaker_elcb', breakerelcb: 'breaker_elcb',
  gcb: 'breaker_gcb', breakergcb: 'breaker_gcb',
  ocb: 'breaker_ocb', breakerocb: 'breaker_ocb',

  // ── 개폐기 (29차 결함: disconnectingswitch 가 빠져 있었다)
  switch: 'switch',
  disconnector: 'switch_disconnector', disconnectswitch: 'switch_disconnector',
  disconnectingswitch: 'switch_disconnector', switchdisconnector: 'switch_disconnector',
  isolator: 'switch_disconnector', isolatorswitch: 'switch_disconnector',
  ds: 'switch_disconnector', ls: 'switch_disconnector',
  loadbreakswitch: 'switch_load_break', lbs: 'switch_load_break',
  automatictransferswitch: 'switch_transfer', ats: 'switch_transfer',

  // ── 퓨즈·COS
  fuse: 'fuse', powerfuse: 'fuse', pf: 'fuse',
  cutoutswitch: 'cutout_switch', cos: 'cutout_switch',

  // ── 전력용 변압기
  transformer: 'transformer', powertransformer: 'transformer',
  distributiontransformer: 'transformer', moldtransformer: 'transformer', tr: 'transformer',
  transformerwinding: 'transformer_winding',

  // ── 계기용변성기. 24·26차 결함의 자리 — 전력변압기와 절대 섞지 않는다.
  currenttransformer: 'current_transformer', ct: 'current_transformer',
  transformerct: 'current_transformer',
  zerosequencecurrenttransformer: 'zero_sequence_ct',
  zerophasecurrenttransformer: 'zero_sequence_ct',
  zct: 'zero_sequence_ct', transformerzct: 'zero_sequence_ct',
  potentialtransformer: 'voltage_transformer', voltagetransformer: 'voltage_transformer',
  vt: 'voltage_transformer', pt: 'voltage_transformer', ppt: 'voltage_transformer',
  vtpt: 'voltage_transformer', ptvt: 'voltage_transformer', transformervt: 'voltage_transformer',
  gpt: 'ground_potential_transformer', transformergpt: 'ground_potential_transformer',
  groundpotentialtransformer: 'ground_potential_transformer',
  instrumenttransformer: 'instrument_transformer',
  meteringoutfit: 'metering_outfit', meteroutfit: 'metering_outfit', mof: 'metering_outfit',

  // ── 계측
  meter: 'meter', digitalmeter: 'meter', watthourmeter: 'meter', kwhmeter: 'meter',
  ammeter: 'ammeter', voltmeter: 'voltmeter',
  relay: 'relay', ocr: 'relay', ocgr: 'relay', ogr: 'relay', protectiverelay: 'relay',
  coil: 'coil', trippingcoil: 'coil',

  // ── 피뢰기. 29차 결함: lightningarrester 가 빠져 있었다.
  arrester: 'arrester', surgearrester: 'arrester', lightningarrester: 'arrester',
  surgeabsorber: 'arrester', spd: 'arrester', la: 'arrester',

  // ── 수동 소자
  capacitor: 'capacitor', shuntcapacitor: 'capacitor',
  reactor: 'reactor', shuntreactor: 'reactor',
  resistor: 'resistor', shunt: 'shunt',
  battery: 'battery', rectifier: 'rectifier',
  converter: 'converter', powerconverter: 'converter', inverter: 'converter',

  // ── 구조·결선
  busbar: 'busbar', bus: 'busbar',
  cable: 'cable', cablehead: 'cable_head',
  terminal: 'terminal', node: 'terminal', junction: 'terminal',
  ground: 'ground', groundrod: 'ground', earth: 'ground',
  panel: 'panel', module: 'panel', switchboard: 'panel', switchgear: 'panel',

  // ── 전원·부하
  source: 'source', generator: 'generator', gen: 'generator',
  load: 'load', loadgeneral: 'load', houseload: 'load', residentialload: 'load', house: 'load',
  motor: 'motor', lamp: 'lamp', pilotlamp: 'lamp', indicatorlight: 'lamp', light: 'lamp',

  // ── 기기가 아닌 것
  arrow: 'annotation', sourceloadarrow: 'annotation', note: 'annotation',
  other: 'other', unknown: 'other', unk: 'other',
} as Record<string, DeviceType>));

/**
 * 별칭에도 없는 새 철자를 위한 **토큰 규칙**. 순서가 곧 우선순위이고, 좁은 것이
 * 먼저다 — `currenttransformer` 가 `transformer` 보다 앞에 있지 않으면 CT 가
 * 전력변압기로 떨어진다(26차 결함의 형태 그대로다).
 */
const SUBSTRING_RULES: ReadonlyArray<readonly [string, DeviceType]> = [
  ['zerosequencecurrenttransformer', 'zero_sequence_ct'],
  ['zerophasecurrenttransformer', 'zero_sequence_ct'],
  ['currenttransformer', 'current_transformer'],
  ['potentialtransformer', 'voltage_transformer'],
  ['voltagetransformer', 'voltage_transformer'],
  ['instrumenttransformer', 'instrument_transformer'],
  ['meteringoutfit', 'metering_outfit'],
  ['transformerwinding', 'transformer_winding'],
  ['circuitbreaker', 'breaker'],
  ['breaker', 'breaker'],
  ['disconnect', 'switch_disconnector'],
  ['arrester', 'arrester'],
  ['transformer', 'transformer'],
  ['meter', 'meter'],
  ['relay', 'relay'],
  ['capacitor', 'capacitor'],
  ['reactor', 'reactor'],
  ['busbar', 'busbar'],
  ['ground', 'ground'],
];

/**
 * 날 타입 문자열을 정본 세부 종류로 옮긴다. 모르면 `'other'` 다 — **추측하지 않는다.**
 *
 * 소비자는 `'other'` 를 받으면 날 문자열을 그대로 보여 주면 된다. 모르는 것을
 * 아는 척 버킷에 넣는 것이 24차의 결함이었다(계기용변성기를 전력변압기로).
 */
export function canonicalDeviceType(raw: unknown): DeviceType {
  const token = flattenTypeToken(raw);
  if (!token) return 'other';
  const alias = ALIASES.get(token);
  if (alias) return alias;
  if (KNOWN.has(token)) return token as DeviceType;
  for (const [needle, type] of SUBSTRING_RULES) {
    if (token.includes(needle)) return type;
  }
  return 'other';
}

/**
 * 정본 세부 종류 → 판정용 계열.
 *
 * `switch` 는 **`fuse` 와 합치지 않는다.** 교재형 도면이 개폐기와 퓨즈에 같은
 * 곡선 블레이드 기호를 쓰는 것은 사실이지만(30차), 그것은 그 도면의 성질이지
 * 어휘의 성질이 아니다. 여기서 합쳐 버리면 구분이 가능한 도면에서도 못 가른다.
 */
export function deviceFamily(type: DeviceType): DeviceFamily {
  switch (type) {
    case 'breaker': case 'breaker_vcb': case 'breaker_acb': case 'breaker_mccb':
    case 'breaker_mcb': case 'breaker_elcb': case 'breaker_gcb': case 'breaker_ocb':
      return 'breaker';
    case 'switch': case 'switch_disconnector': case 'switch_load_break': case 'switch_transfer':
      return 'switch';
    case 'fuse': case 'cutout_switch':
      return 'fuse';
    case 'transformer': case 'transformer_winding':
      return 'transformer';
    case 'current_transformer': case 'zero_sequence_ct': case 'voltage_transformer':
    case 'ground_potential_transformer': case 'instrument_transformer': case 'metering_outfit':
      return 'instrument_transformer';
    case 'meter': case 'ammeter': case 'voltmeter':
      return 'meter';
    case 'relay': case 'coil':
      return 'relay';
    case 'arrester':
      return 'arrester';
    case 'capacitor': case 'reactor': case 'resistor': case 'shunt':
    case 'battery': case 'rectifier': case 'converter':
      return 'passive';
    case 'busbar': case 'cable': case 'cable_head': case 'terminal':
    case 'ground': case 'panel':
      return 'structure';
    case 'source': case 'generator':
      return 'source';
    case 'load': case 'motor': case 'lamp':
      return 'load';
    case 'annotation':
      return 'annotation';
    case 'other':
      return 'other';
  }
}

/** 날 문자열에서 곧바로 계열까지. */
export function deviceFamilyOf(raw: unknown): DeviceFamily {
  return deviceFamily(canonicalDeviceType(raw));
}

/** 계기용변성기·계량기류인가. 전력변압기 대수에 절대 합산하면 안 되는 것들. */
export function isInstrumentTransformer(type: DeviceType): boolean {
  return deviceFamily(type) === 'instrument_transformer';
}

// IDENTITY_SEAL: src/agent/drawing/device-vocabulary | role=기기 어휘 정본 | inputs=모델 날 타입 문자열 | outputs=정본 세부 종류·판정 계열
