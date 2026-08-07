import { canonicalDeviceType, deviceFamily, deviceFamilyOf, DEVICE_TYPES } from '../device-vocabulary';

/**
 * 이 시험의 목적은 별칭이 하나하나 맞는지 확인하는 것이 아니다. **철자 변형을
 * 규칙으로 흡수하는지**를 본다 — 별칭 목록은 못 본 철자를 놓치지만 규칙은 안 놓친다.
 *
 * 아래 입력은 전부 2026-08-07 영수증 전수(52종 614회)에서 실제로 관측된 것이다.
 */

describe('철자 변형은 규칙으로 흡수된다', () => {
  it('구분자·대소문자가 달라도 한 종류다', () => {
    // 26차 결함이 여기 있었다: `current_transformer`(밑줄)만 검사해서
    // `current transformer`(공백)가 전력변압기로 떨어졌다.
    for (const spelling of [
      'current_transformer', 'current transformer', 'currentTransformer',
      'CURRENT-TRANSFORMER', 'Current Transformer', 'CT', 'ct',
    ]) {
      expect(canonicalDeviceType(spelling)).toBe('current_transformer');
    }
  });

  it('영수증에 나온 피뢰기 5철자가 한 종류다', () => {
    // 29차 결함: `lightning_arrester` 가 별칭에 없어 arrester 축이 0 이었다.
    for (const spelling of [
      'surge_arrester', 'arrester', 'surgeArrester', 'lightning_arrester', 'surge_absorber',
    ]) {
      expect(canonicalDeviceType(spelling)).toBe('arrester');
    }
  });

  it('영수증에 나온 PT/VT 6철자가 한 종류다', () => {
    for (const spelling of [
      'potential_transformer', 'potentialTransformer', 'voltage_transformer',
      'vt_pt', 'vt', 'pt',
    ]) {
      expect(canonicalDeviceType(spelling)).toBe('voltage_transformer');
    }
  });

  it('MOF 3철자가 한 종류다 — 두 철자는 각각 한 번씩만 관측됐다', () => {
    // `metering_out_fit` 과 `metering_outfit` 이 각각 1회. 모델이 회차마다
    // 철자를 새로 짓는다는 증거이자, 목록이 아니라 규칙이 필요한 이유다.
    for (const spelling of ['metering_out_fit', 'metering_outfit', 'mof', 'MOF']) {
      expect(canonicalDeviceType(spelling)).toBe('metering_outfit');
    }
  });
});

describe('계기용변성기는 전력변압기와 절대 섞이지 않는다', () => {
  it('24차 결함의 입력들이 전력변압기로 떨어지지 않는다', () => {
    // 실측: 그래프의 전력변압기 노드는 5~8개인데 계수가 11 이었다.
    // 차이는 instrument_transformer 4 + potential_transformer 3 의 합산이었다.
    for (const spelling of [
      'instrument_transformer', 'current_transformer', 'potential_transformer',
      'zero_sequence_current_transformer', 'zct', 'metering_outfit',
    ]) {
      expect(deviceFamilyOf(spelling)).toBe('instrument_transformer');
      expect(deviceFamilyOf(spelling)).not.toBe('transformer');
    }
    expect(deviceFamilyOf('transformer')).toBe('transformer');
    expect(deviceFamilyOf('mold transformer')).toBe('transformer');
  });

  it('좁은 규칙이 넓은 규칙보다 먼저다', () => {
    // 순서가 뒤집히면 `…current_transformer` 가 `includes('transformer')` 에
    // 먼저 걸려 전력변압기가 된다 — 26차 결함의 형태 그대로다.
    expect(canonicalDeviceType('measuring_current_transformer_unit')).toBe('current_transformer');
    expect(canonicalDeviceType('zero_phase_current_transformer')).toBe('zero_sequence_ct');
  });
});

describe('세부 종류는 보존된다', () => {
  it('VCB·ACB·MCCB 는 서로 다른 기기로 남는다', () => {
    // 첫 판은 전부 `breaker` 로 접었다가 도메인이 필요로 하는 구분을 없앴다.
    expect(canonicalDeviceType('VCB')).toBe('breaker_vcb');
    expect(canonicalDeviceType('ACB')).toBe('breaker_acb');
    expect(canonicalDeviceType('MCCB')).toBe('breaker_mccb');
    expect(new Set(['VCB', 'ACB', 'MCCB'].map(canonicalDeviceType)).size).toBe(3);
  });

  it('그러나 판정 계열은 하나다', () => {
    for (const spelling of ['VCB', 'ACB', 'MCCB', 'breaker', 'circuit breaker']) {
      expect(deviceFamilyOf(spelling)).toBe('breaker');
    }
  });
});

describe('모르는 것은 추측하지 않는다', () => {
  it('기기 토큰이 없으면 other 다', () => {
    expect(canonicalDeviceType('widget')).toBe('other');
    expect(canonicalDeviceType('zzz_unknown_thing')).toBe('other');
    expect(canonicalDeviceType('')).toBe('other');
    expect(canonicalDeviceType('   ')).toBe('other');
    expect(canonicalDeviceType(null)).toBe('other');
    expect(canonicalDeviceType(undefined)).toBe('other');
  });

  it('토큰 규칙은 못 본 철자를 흡수하도록 일부러 넓다', () => {
    // 이것이 규칙의 값이자 대가다. `shunt_capacitor_bank_1` 처럼 처음 보는
    // 철자를 잡아 주는 대신, 기기 낱말을 품은 엉뚱한 문자열도 잡는다.
    // **놓치는 쪽보다 넓게 잡는 쪽을 고른 것이다** — 놓치면 골든 축이 0 이
    // 되어 조용히 사라지지만(29차), 넓게 잡으면 계수가 틀려 눈에 띈다.
    expect(canonicalDeviceType('shunt_capacitor_bank_1')).toBe('capacitor');
    expect(canonicalDeviceType('oil_immersed_transformer_3phase')).toBe('transformer');
    expect(canonicalDeviceType('flux_capacitor_9000')).toBe('capacitor');
  });
});

describe('어휘는 닫혀 있다', () => {
  it('canonicalDeviceType 은 반드시 DEVICE_TYPES 안의 값을 낸다', () => {
    const closed = new Set<string>(DEVICE_TYPES);
    const observed = [
      // 2026-08-07 영수증 전수 52종
      'breaker', 'switch', 'meter', 'fuse', 'terminal', 'relay', 'ground',
      'current_transformer', 'ct', 'busbar', 'transformer', 'surge_arrester',
      'cable', 'instrument_transformer', 'capacitor', 'vt_pt',
      'zero_sequence_current_transformer', 'mccb', 'cable_head', 'resistor',
      'currentTransformer', 'panel', 'arrester', 'reactor', 'arrow',
      'potential_transformer', 'lamp', 'surgeArrester', 'source', 'battery',
      'rectifier', 'load', 'digital_meter', 'zero_phase_current_transformer',
      'potentialTransformer', 'lightning_arrester', 'shunt', 'pilot_lamp',
      'vacuum_circuit_breaker', 'surge_absorber', 'module', 'power_converter',
      'automatic_transfer_switch', 'indicator_light', 'voltage_transformer',
      'vt', 'other', 'generator', 'metering_out_fit', 'metering_outfit', 'mof', 'coil',
      // 지어낸 것도 닫힌 어휘를 벗어나면 안 된다
      'nonsense', '', '   ', '12345',
    ];
    for (const raw of observed) {
      expect(closed.has(canonicalDeviceType(raw))).toBe(true);
    }
  });

  it('모든 DeviceType 이 계열을 갖는다', () => {
    // deviceFamily 는 exhaustive switch 라 새 DeviceType 을 더하면 컴파일이
    // 깨진다. 이 시험은 그 계약이 실제로 값에도 성립하는지 본다.
    for (const type of DEVICE_TYPES) {
      expect(typeof deviceFamily(type)).toBe('string');
    }
  });

  it('영수증 52종 중 other 로 떨어지는 것은 없다', () => {
    // 관측된 어휘를 하나라도 못 알아보면 그 자리가 다음 결함이다.
    const observed = [
      'breaker', 'switch', 'meter', 'fuse', 'terminal', 'relay', 'ground',
      'current_transformer', 'ct', 'busbar', 'transformer', 'surge_arrester',
      'cable', 'instrument_transformer', 'capacitor', 'vt_pt',
      'zero_sequence_current_transformer', 'mccb', 'cable_head', 'resistor',
      'currentTransformer', 'panel', 'arrester', 'reactor',
      'potential_transformer', 'lamp', 'surgeArrester', 'source', 'battery',
      'rectifier', 'load', 'digital_meter', 'zero_phase_current_transformer',
      'potentialTransformer', 'lightning_arrester', 'shunt', 'pilot_lamp',
      'vacuum_circuit_breaker', 'surge_absorber', 'module', 'power_converter',
      'automatic_transfer_switch', 'indicator_light', 'voltage_transformer',
      'vt', 'generator', 'metering_out_fit', 'metering_outfit', 'mof', 'coil',
    ];
    const unknown = observed.filter((raw) => canonicalDeviceType(raw) === 'other');
    expect(unknown).toEqual([]);
  });
});
