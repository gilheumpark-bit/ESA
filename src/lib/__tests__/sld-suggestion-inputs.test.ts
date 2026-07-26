/**
 * 도면이 읽은 값이 계산기 폼까지 도달하는가.
 *
 * 도면 분석은 기기와 값을 읽어 화면에 보여주고 계산기로 링크한다. 그런데
 * 그 링크가 나르는 입력은 **그 계산기가 쓰지 않는 이름**이었고, 값도
 * "250A"·"22.9kV" 처럼 단위가 붙은 문자열이라 폼이 Number() 로 버렸다.
 * 실측(2026-07-26): 제안·체인 12개 조합 중 cable-sizing 하나만 이름이 맞았다.
 * 오류가 나지 않아 "앱이 못 읽었나" 로만 보인다.
 */
import { generateSuggestions, generateCalcChainFromSLD } from '../sld-recognition';
import { CALCULATOR_PARAMS } from '../calculator-params';
import { parseMeasuredValue } from '../calculator-lexicon';

const ANALYSIS = {
  components: [
    { id: 'tx1', type: 'transformer' as const, label: 'TR-1', rating: '500kVA', voltage: '22.9kV' },
    { id: 'cb1', type: 'breaker' as const, label: 'MCCB-1', current: '250A', voltage: '380V' },
    { id: 'm1', type: 'motor' as const, label: 'M-1', rating: '30kW', voltage: '380V' },
    { id: 'l1', type: 'load' as const, label: 'L-1', rating: '50kW' },
    { id: 'cap1', type: 'capacitor' as const, label: 'SC-1', rating: '100kVA' },
  ],
  connections: [
    { from: 'tx1', to: 'cb1', length: '100m', conductorSize: '240mm2', cableType: 'XLPE' },
  ],
} as unknown as Parameters<typeof generateSuggestions>[0];

describe('도면 제안이 계산기에 넘기는 입력', () => {
  const suggestions = generateSuggestions(ANALYSIS);

  it('제안이 나온다', () => {
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it.each(
    // 각 제안을 개별 케이스로 — 어느 계산기가 깨졌는지 이름으로 드러나게.
    generateSuggestions(ANALYSIS).map((s, i) => [`${i}:${s.calculatorId}`, s] as const),
  )('%s — 그 계산기에 없는 입력 이름을 싣지 않는다', (_label, suggestion) => {
    const own = new Set((CALCULATOR_PARAMS[suggestion.calculatorId] ?? []).map((p) => p.name));
    expect(Object.keys(suggestion.inputs).filter((k) => !own.has(k))).toEqual([]);
  });

  it.each(
    generateSuggestions(ANALYSIS).map((s, i) => [`${i}:${s.calculatorId}`, s] as const),
  )('%s — 값이 폼이 읽을 수 있는 형이다', (_label, suggestion) => {
    for (const [name, value] of Object.entries(suggestion.inputs)) {
      const def = (CALCULATOR_PARAMS[suggestion.calculatorId] ?? []).find((p) => p.name === name)!;
      if (def.type !== 'number') continue;
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value as number)).toBe(true);
    }
  });

  it('단위가 붙은 판독값을 그 파라미터 단위로 옮긴다', () => {
    const breaker = suggestions.find((s) => s.calculatorId === 'breaker-sizing');
    expect(breaker?.inputs.loadCurrent).toBe(250);

    const shortCircuit = suggestions.find((s) => s.calculatorId === 'short-circuit');
    // 22.9kV → 22900V (파라미터 단위가 V)
    expect(shortCircuit?.inputs.systemVoltage).toBe(22900);
    // 500kVA → 500 (파라미터 단위가 이미 kVA)
    expect(shortCircuit?.inputs.transformerCapacity).toBe(500);

    const drop = suggestions.find((s) => s.calculatorId === 'voltage-drop');
    expect(drop?.inputs.cableSize).toBe(240);
    expect(drop?.inputs.length).toBe(100);
  });

  it('읽지 못한 값은 넣지 않는다 — 빈 칸이 잘못 채워진 칸보다 낫다', () => {
    const withJunk = generateSuggestions({
      components: [{ id: 'cb', type: 'breaker', label: 'X', current: '미상', voltage: '' }],
      connections: [],
    } as unknown as Parameters<typeof generateSuggestions>[0]);
    for (const s of withJunk) expect(s.inputs.loadCurrent).toBeUndefined();
  });
});

describe('parseMeasuredValue', () => {
  const param = (id: string, name: string) => CALCULATOR_PARAMS[id]!.find((p) => p.name === name)!;

  it.each([
    ['breaker-sizing', 'loadCurrent', '250A', 250],
    ['breaker-sizing', 'loadCurrent', '250 A', 250],
    ['short-circuit', 'systemVoltage', '22.9kV', 22900],
    ['short-circuit', 'transformerCapacity', '10MVA', 10000],
    ['voltage-drop', 'cableSize', '240mm2', 240],
    ['voltage-drop', 'cableSize', '240sq', 240],
    ['voltage-drop', 'cableSize', '240㎟', 240],
    ['voltage-drop', 'length', '100m', 100],
    ['voltage-drop', 'voltage', '380', 380],
  ])('%s.%s ← %s', (id, name, raw, expected) => {
    expect(parseMeasuredValue(param(id as string, name as string), raw)).toBe(expected);
  });

  it.each(['미상', '', 'N/A', '약 250A 내외'])('읽을 수 없는 "%s" 는 undefined', (raw) => {
    expect(parseMeasuredValue(param('breaker-sizing', 'loadCurrent'), raw)).toBeUndefined();
  });
});

describe('제안 중복', () => {
  it('같은 계산기·사유·입력은 한 줄로 합친다', () => {
    const twin = {
      components: [
        { id: 'cb1', type: 'breaker', label: 'MCCB 3P-250/250', current: '250A', voltage: '380V' },
        { id: 'cb2', type: 'breaker', label: 'MCCB 3P-250/250', current: '250A', voltage: '380V' },
      ],
      connections: [],
    } as unknown as Parameters<typeof generateSuggestions>[0];
    expect(generateSuggestions(twin)).toHaveLength(1);
  });

  it('라벨이 다르면 합치지 않는다', () => {
    const distinct = {
      components: [
        { id: 'cb1', type: 'breaker', label: 'MCCB-1', current: '250A', voltage: '380V' },
        { id: 'cb2', type: 'breaker', label: 'MCCB-2', current: '250A', voltage: '380V' },
      ],
      connections: [],
    } as unknown as Parameters<typeof generateSuggestions>[0];
    expect(generateSuggestions(distinct)).toHaveLength(2);
  });
});

/**
 * 체인도 같은 계약을 지킨다.
 *
 * 앞 수리(ddb54c4)는 제안만 고치고 체인 생성기를 빠뜨렸다. 라이브로 확인하니
 * 체인은 여전히 `rating`·`transformerRating` 을 보내고 있었다(실측 2026-07-26,
 * gate 픽스처 circuit.pdf → 2단계 전부 없는 이름). 측정해 놓고 반경을 다
 * 돌지 않은 것이라, 여기서 제안과 같은 케이스로 잠근다.
 */
describe('도면 체인이 계산기에 넘기는 입력', () => {
  const CHAIN_ANALYSIS = {
    systemType: '3P4W',
    systemVoltage: '380V',
    components: [
      { id: 'tx1', type: 'transformer', label: 'TR-1', rating: '1000kVA', voltage: '22.9kV' },
      { id: 'l1', type: 'load', label: 'L-1', rating: '300kW' },
      { id: 'm1', type: 'motor', label: 'M-1', rating: '30kW', voltage: '380V' },
      { id: 'cb1', type: 'breaker', label: 'MCCB-1', current: '250A' },
    ],
    connections: [{ from: 'tx1', to: 'cb1', length: '50m', conductorSize: '95mm2' }],
  } as unknown as Parameters<typeof generateCalcChainFromSLD>[0];

  const chain = generateCalcChainFromSLD(CHAIN_ANALYSIS);

  it('체인이 생성된다', () => {
    expect(chain.length).toBeGreaterThan(0);
  });

  it.each(generateCalcChainFromSLD(CHAIN_ANALYSIS).map((s) => [`step${s.step}:${s.calculatorId}`, s] as const))(
    '%s — 그 계산기에 없는 입력 이름을 싣지 않는다',
    (_label, step) => {
      const own = new Set((CALCULATOR_PARAMS[step.calculatorId] ?? []).map((p) => p.name));
      expect(Object.keys(step.inputs).filter((k) => !own.has(k))).toEqual([]);
    },
  );

  it.each(generateCalcChainFromSLD(CHAIN_ANALYSIS).map((s) => [`step${s.step}:${s.calculatorId}`, s] as const))(
    '%s — 값이 폼이 읽을 수 있는 형이다',
    (_label, step) => {
      for (const [name, value] of Object.entries(step.inputs)) {
        const def = (CALCULATOR_PARAMS[step.calculatorId] ?? []).find((p) => p.name === name)!;
        if (def.type !== 'number') continue;
        expect(typeof value).toBe('number');
      }
    },
  );

  it('단위를 파라미터 단위로 옮긴다', () => {
    const sc = chain.find((s) => s.calculatorId === 'short-circuit');
    expect(sc?.inputs.transformerCapacity).toBe(1000);
    expect(sc?.inputs.systemVoltage).toBe(380);

    const motor = chain.find((s) => s.calculatorId === 'starting-current');
    expect(motor?.inputs.ratedPower).toBe(30);
  });

  it('목록형 항목도 계산기 스키마대로 넘긴다', () => {
    const demand = chain.find((s) => s.calculatorId === 'max-demand');
    expect(demand?.inputs.loads).toEqual([{ name: 'L-1', ratedPower: 300 }]);
  });
});
