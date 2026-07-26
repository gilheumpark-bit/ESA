/**
 * chat 계산기 라우팅과 영수증 안전 불변식.
 *
 * 실공급자 실증(2026-07-25)에서 두 층이 동시에 깨져 있었다.
 *
 *  1. 라우팅 — 매핑된 8개 중 5개만 chat 에서 실행됐다. 검색용 parseQuery 가 단독
 *     문지기였는데 그 파서는 계산기 6종만 이름을 댈 수 있어서, "조도 계산"처럼
 *     의도 파서가 정확히 아는 표현도 떨어졌다.
 *  2. 영수증 — 실행된 것들도 상당수가 **사용자 수치가 아니라 기본값으로** 계산됐다.
 *     계산기 파라미터는 대부분 defaultValue 를 갖는다. 폼 UI 라면 사용자가 그
 *     기본값을 보고 고칠 수 있지만 chat 에서는 보이지 않는다. "면적 100제곱미터
 *     … 조명률 0.6 보수율 0.8" 질문에서 추출은 0건이었고, 영수증은 area=50·
 *     UF=0.5·MF=0.7 로 계산한 24EA 를 "검증된 계산기" 수치로 모델에 넘겼다.
 *
 * 그래서 아래 두 가지를 따로 잠근다: 어느 계산기로 가는가(라우팅), 그리고
 * 영수증이 나왔다면 그것이 사용자가 준 수치로 계산됐는가(안전).
 */

import { analyzeCalcIntent, coerceCalculatorInput } from '../calc-intent-bridge';
import { resolveChatCalculationEvidence } from '../chat-calculation-evidence';
import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import { CALCULATOR_PARAMS } from '../calculator-params';

/** 각 질문은 해당 계산기의 필수 입력을 모두 담도록 썼다. */
const ROUTES: Array<{ id: string; query: string }> = [
  { id: 'voltage-drop', query: '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9' },
  { id: 'breaker-sizing', query: '차단기 용량 선정: 3상 380V 부하전류 100A 케이블 35sq' },
  { id: 'short-circuit', query: '단락전류 계산: 변압기 1000kVA 380V %Z 5%' },
  { id: 'transformer-capacity', query: '변압기 용량 산정: 부하 800kW 역률 0.9 수용률 0.8 여유율 20%' },
  { id: 'ground-resistance', query: '접지저항 계산: 접지봉 길이 2.4m 직경 14mm 대지저항률 100 옴미터' },
  { id: 'cable-sizing', query: '케이블 굵기 선정: 3상 380V 부하 100A 긍장 50m 허용 전압강하 3% 구리 도체' },
  { id: 'illuminance', query: '조도 계산: 사무실 면적 100제곱미터 광속 3000lm 등기구 20개 조명률 0.6 보수율 0.8' },
  { id: 'max-demand', query: '최대수요전력 계산: 설비용량 500kW 수용률 0.7 부등률 1.2 부하율 0.6' },
];

describe('라우팅 — 매핑된 계산기에 도달한다', () => {
  it.each(ROUTES)('$id 로 라우팅된다', ({ id, query }) => {
    expect(analyzeCalcIntent(query).calculatorId).toBe(id);
  });
});

describe('영수증 안전 — 사용자 수치로 계산된 것만 영수증이 된다', () => {
  // 이것이 핵심 불변식이다. 통과 목록을 박아 두면 추출기가 좋아질 때마다 테스트를
  // 고쳐야 하고, 반대로 나빠져도 목록이 그대로면 드러나지 않는다. 대신 "영수증이
  // 나왔다면 사용자가 준 수치를 하나도 흘리지 않았다"만 검사한다.
  it.each(ROUTES)('$id — 영수증이 있으면 질문의 수치를 하나도 흘리지 않았다', ({ query }) => {
    const evidence = resolveChatCalculationEvidence(query);
    if (!evidence) return; // 영수증을 안 내는 것은 안전한 쪽이다
    expect(analyzeCalcIntent(query).unreadNumbers).toEqual([]);
  });

  it.each(ROUTES)('$id — 읽은 입력은 영수증에 그 값 그대로 들어간다', ({ query }) => {
    const evidence = resolveChatCalculationEvidence(query);
    if (!evidence) return;
    const intent = analyzeCalcIntent(query);
    const paramNames = new Set(intent.allParams.map((p) => p.name));
    for (const [name, value] of Object.entries(intent.extractedParams)) {
      if (!paramNames.has(name)) continue; // 이 계산기의 입력이 아닌 값(예: 차단기의 3상)
      expect({ name, value: String(evidence.input[name]) }).toEqual({ name, value: String(value) });
    }
  });

  /**
   * 실제로 났던 사고를 그대로 재현해 둔다. 이 질문은 다섯 개의 수치를 주는데
   * 추출기는 그중 하나도 이해하지 못한다. 예전에는 그 상태로 기본값 여섯 개를
   * 채워 24EA 라는 "검증된" 답을 만들었다.
   */
  it('조도 질문의 수치를 못 읽으면 기본값으로 영수증을 만들지 않는다', () => {
    const query = ROUTES.find((r) => r.id === 'illuminance')!.query;
    const intent = analyzeCalcIntent(query);
    expect(intent.calculatorId).toBe('illuminance'); // 라우팅은 되어야 한다
    expect(intent.unreadNumbers.length).toBeGreaterThan(0);
    expect(intent.canAutoExecute).toBe(false);
    expect(resolveChatCalculationEvidence(query)).toBeNull();
  });

  /**
   * 목록을 입력으로 받는 계산기. 한 문장은 부하 하나를 말하므로 1항목으로 묶는다
   * (계약은 `calculator-reach.test.ts`). 다만 이 질문의 "부하율 0.6" 은 max-demand
   * 의 입력이 아니어서 읽히지 않으므로, 그 값을 흘린 채 계산하지 않는다.
   */
  it('목록형이라도 읽은 값은 항목으로 묶되, 못 읽은 수치가 있으면 실행하지 않는다', () => {
    const intent = analyzeCalcIntent(ROUTES.find((r) => r.id === 'max-demand')!.query);
    expect(intent.calculatorId).toBe('max-demand');
    expect(intent.extractedParams.loads).toEqual([
      expect.objectContaining({ ratedPower: 500, demandFactor: 0.7 }),
    ]);
    expect(intent.unreadNumbers).toContain(0.6);
    expect(intent.canAutoExecute).toBe(false);
  });
});

describe('게이트 — 검색 파서가 모르는 표현은 통과, 계산이 아닌 질문은 차단', () => {
  it.each([
    ['illuminance', '조도 계산: 사무실 면적 100제곱미터 광속 3000lm 등기구 20개 조명률 0.6 보수율 0.8'],
    ['max-demand', '최대수요전력 계산: 설비용량 500kW 수용률 0.7 부등률 1.2 부하율 0.6'],
  ])('%s — 검색 파서가 이름을 못 대도 도달한다', (id, query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBe(id);
  });

  /**
   * 계산기 이름만 의도 파서에서 빌려오고 **의도 판정은 parseQuery 를 그대로 따른다**.
   *
   * 아래는 수리 중간본에서 실제로 계산기로 샜던 질의다. 전기 용어가 겹칠 뿐
   * 규정 원문·개념 설명을 찾는 질문이고, 여기서 계산 패널이 뜨면 홈 화면이 검색
   * 대신 계산기를 띄운다(page.tsx 의 hasCalcIntent 분기). 첫 줄은 앱이 홈에
   * 걸어 둔 히어로 예시라 회귀 시 즉시 눈에 띈다.
   */
  it.each([
    'KEC 232.3.9 전압강하 조항 원문과 예외',
    'KEC 전압강하 기준 알려줘',
    '단락전류 관련 규정이 뭐야',
    '전압강하가 생기는 이유를 설명해줘',
    '접지저항이 높으면 어떤 문제가 생기나요',
    '오늘 날씨 어때?',
    '고맙습니다',
  ])('계산 요청이 아닌 "%s" 는 계산기를 열지 않는다', (query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBeUndefined();
  });
});

/**
 * chat 은 자체 변환이 있어 무사했지만 홈·검색의 인라인 계산은 추출값을 그대로
 * 넘겨 `phase must be one of [1, 3], got 3` 으로 떨어졌다(실측 2026-07-25 —
 * 홈 히어로 예시 "전압강하 검토"가 그 경로다). 스위트는 그때도 전부 초록이었다.
 * 그래서 계산기를 **실제로 돌려** 검증한다.
 */
describe('추출값은 계산기가 받는 타입으로 변환된다', () => {
  it("phase '3' 은 문자열이 아니라 숫자 3 으로 들어간다", () => {
    const intent = analyzeCalcIntent('전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9');
    expect(intent.extractedParams.phase).toBe('3'); // 파서는 문자열을 준다
    expect(coerceCalculatorInput(intent.allParams, intent.extractedParams).input.phase).toBe(3);
  });

  it.each(ROUTES)('$id — 자동 실행 대상은 변환 후 계산기가 실제로 돈다', ({ id, query }) => {
    const intent = analyzeCalcIntent(query);
    if (!intent.canAutoExecute) return; // 자동 실행하지 않는 것은 이 계약의 대상이 아니다
    const { input, invalid } = coerceCalculatorInput(intent.allParams, intent.extractedParams);
    expect(invalid).toEqual([]);
    const calculator = CALCULATOR_REGISTRY.get(id);
    expect(() => calculator!.calculator(input)).not.toThrow();
  });
});

describe('퍼센트는 무엇의 퍼센트인지로 읽는다', () => {
  // 이전에는 문장의 첫 퍼센트를 무조건 전압강하 한도로 읽어, %Z 도 여유율도
  // 전압강하가 됐고 정작 해당 계산기의 입력은 기본값으로 채워졌다.
  it('%Z 5% 는 임피던스로 읽고 영수증에 그대로 들어간다', () => {
    const evidence = resolveChatCalculationEvidence('단락전류 계산: 변압기 1000kVA 380V %Z 5%');
    expect(evidence?.input.impedancePercent).toBe(5);
    expect(evidence?.input.systemVoltage).toBe(380);
  });

  it('허용 전압강하 3% 는 전압강하 한도로 읽는다', () => {
    const evidence = resolveChatCalculationEvidence(
      '케이블 굵기 선정: 3상 380V 부하 100A 긍장 50m 허용 전압강하 3% 구리 도체',
    );
    expect(evidence?.input.dropLimitPercent).toBe(3);
  });
});

/**
 * 추출은 그 계산기가 가진 파라미터 안에서만 일어난다.
 *
 * 전역 의도 파서는 계산기를 모른 채 12종 패턴으로 읽는다. 그 결과를 그대로
 * 넘기면 이 계산기에 없는 파라미터가 섞여 들어오고, 그게 "값을 읽었다"로
 * 세어진다 — 실측(2026-07-26): "조도 계산 케이블 길이 10m" 이
 * {length:10} 을 얻어 unreadNumbers 는 비고 readSomething 은 true 가 됐다.
 * illuminance 에 length 는 없으므로 그 영수증은 area=50·UF=0.5·MF=0.7,
 * 즉 **전부 기본값**으로 계산된 것이 "검증된 계산기 영수증" 으로 나갔다.
 *
 * 1745개 스위트가 전부 green 인 채로 통과했다. 사례가 아니라 불변식을 잠근다.
 */
describe('추출 범위', () => {
  const PROBES = [
    '조도 계산 케이블 길이 10m',
    '조도 계산 전압 380V',
    '조도 계산 사무실 가로 10m 세로 8m 높이 2.7m',
    'UPS 용량 계산 케이블 100m',
    '전압강하 계산 케이블 100m 전류 60A 전압 380V 단면적 35mm2',
    '조도 계산 면적 80m2 목표조도 500lx',
    '접지저항 계산 봉 길이 2.4m',
    '단락전류 계산: 변압기 1000kVA 380V %Z 5%',
    ...ROUTES.map((r) => r.query),
  ];

  it.each(PROBES)('%s — 그 계산기에 없는 파라미터는 남지 않는다', (query) => {
    const intent = analyzeCalcIntent(query);
    if (!intent.calculatorId) return;
    const own = new Set((CALCULATOR_PARAMS[intent.calculatorId] ?? []).map((p) => p.name));
    const alien = Object.keys(intent.extractedParams).filter((k) => !own.has(k));
    expect(alien).toEqual([]);
  });

  it('없는 파라미터 하나로 자동 실행이 열리지 않는다', () => {
    const intent = analyzeCalcIntent('조도 계산 케이블 길이 10m');
    expect(intent.calculatorId).toBe('illuminance');
    expect(intent.canAutoExecute).toBe(false);
    // 읽지 못한 수치는 숨기지 않고 그대로 드러낸다.
    expect(intent.unreadNumbers).toContain(10);
    expect(resolveChatCalculationEvidence('조도 계산 케이블 길이 10m')).toBeNull();
  });

  it('읽지 못한 수치를 미확인 목록에서 빠뜨리지 않는다', () => {
    const intent = analyzeCalcIntent('조도 계산 사무실 가로 10m 세로 8m 높이 2.7m');
    expect(intent.unreadNumbers).toEqual(expect.arrayContaining([10, 8, 2.7]));
  });
});

/**
 * 영수증은 질문에서 읽은 값과 앱이 채운 기본값을 섞어 하나의 input 으로 넘긴다.
 * 폼 UI 라면 사용자가 기본값을 눈으로 보지만 chat 에서는 보이지 않는다.
 *
 * 가정은 답을 크게 흔든다 — "케이블 100m 전류 60A 전압 380V 단면적 35mm2" 는
 * 상수·도체·역률이 없어 phase=3·Cu·pf=0.85 로 채워진다. 단상이면 같은 조건에서
 * 4.79V 가 아니라 5.53V 다(실측 2026-07-26). 조도는 더하다 — 사용자가 준 값은
 * 둘인데 결과를 정하는 광속·조명률·보수율·소비전력 넷이 전부 기본값이다.
 */
describe('영수증의 가정 표시', () => {
  it('질문에서 읽지 않은 입력을 가정으로 분리한다', () => {
    const ev = resolveChatCalculationEvidence('전압강하 계산 케이블 100m 전류 60A 전압 380V 단면적 35mm2');
    expect(ev).not.toBeNull();
    expect(ev!.assumed.join(' ')).toContain('상수');
    expect(ev!.assumed.join(' ')).toContain('역률');
    // 질문이 준 값은 가정이 아니다.
    expect(ev!.assumed.join(' ')).not.toContain('전선 길이');
    expect(ev!.assumed.join(' ')).not.toContain('부하 전류');
  });

  it('가정을 프롬프트에 실어 답변이 밝히게 한다', () => {
    const ev = resolveChatCalculationEvidence('조도 계산 면적 80m2 목표조도 500lx');
    expect(ev!.assumed.length).toBeGreaterThan(0);
    expect(ev!.promptContext).toContain('질문에 없어 앱이 채운 입력');
    expect(ev!.promptContext).toContain('가정으로 명시');
  });

  it('가정이 없으면 군말을 붙이지 않는다', () => {
    const ev = resolveChatCalculationEvidence('전압강하 계산 케이블 100m 전류 60A 전압 380V 단면적 35mm2 단상 알루미늄 역률 0.9');
    if (ev && ev.assumed.length === 0) {
      expect(ev.promptContext).not.toContain('질문에 없어 앱이 채운 입력');
    }
  });
});

/**
 * 수배전·변전소 표기의 자릿수.
 *
 * 계통은 22.9kV·154kV 로, 변압기는 10MVA 로 쓴다. 파라미터 단위는 V·kVA 라
 * 그대로는 세 자리씩 어긋난다 — 실측(2026-07-26): "단락전류 계산 22.9kV 10MVA"
 * 에서 추출 0건이었다(안전하게 거부하긴 했으나 쓸 수가 없었다).
 *
 * 접두어는 **대소문자를 가려야 한다**. `/i` 로 뭉뚱그리면 "15mA"(밀리암페어,
 * 누전차단기 정격감도전류의 표기)가 15,000,000A 가 된다.
 */
describe('SI 접두어 환산', () => {
  const read = (q: string) => analyzeCalcIntent(q).extractedParams as Record<string, number>;

  it('kV 를 V 로 옮긴다 — 22.9kV·154kV', () => {
    expect(read('전압강하 계산 22.9kV 전류 200A 케이블 500m 단면적 240mm2').voltage).toBe(22900);
    expect(read('전압강하 계산 154kV 전류 500A 케이블 2000m 단면적 400mm2').voltage).toBe(154000);
  });

  it('MVA 를 kVA 로, MW 를 kW 로 옮긴다', () => {
    expect(read('단락전류 계산: 변압기 10MVA 22.9kV %Z 5%').transformerCapacity).toBe(10000);
    expect(read('변압기 용량 산정 부하 3MW 역률 0.9 수용률 0.8 여유율 20%').totalLoad).toBe(3000);
  });

  it('kA 를 A 로 옮긴다', () => {
    expect(read('전압강하 계산 전압 380V 전류 0.5kA 케이블 10m 단면적 240mm2').current).toBe(500);
  });

  it('밀리와 메가를 가른다 — 이걸 뭉개면 6자리가 틀린다', () => {
    expect(read('전압강하 계산 전압 380V 전류 15mA 케이블 10m 단면적 2.5mm2').current).toBe(0.015);
    expect(read('전압강하 계산 전압 380V 전류 15MA 케이블 10m 단면적 2.5mm2').current).toBe(15000000);
  });

  it('환산한 값도 "읽은 수치"로 세어 자동 실행을 막지 않는다', () => {
    // 값(22900)과 질문의 숫자(22.9)가 다르므로, 값 대조만 하면 22.9 가 미확인으로
    // 남아 멀쩡한 질문이 되묻기로 떨어진다.
    const intent = analyzeCalcIntent('단락전류 계산: 변압기 10MVA 22.9kV %Z 5%');
    expect(intent.unreadNumbers).toEqual([]);
    expect(intent.canAutoExecute).toBe(true);
  });

  it('환산 결과가 계산기까지 그대로 흘러간다', () => {
    const ev = resolveChatCalculationEvidence('단락전류 계산: 변압기 10MVA 22.9kV %Z 5%');
    expect(ev?.input.systemVoltage).toBe(22900);
    expect(ev?.input.transformerCapacity).toBe(10000);
  });

  it('옮길 수 없는 단위는 추측하지 않는다', () => {
    // lx 는 전기 단위계로 환산할 대상이 아니다 — 조도 파라미터에만 붙는다.
    expect(read('전압강하 계산 전압 380V 전류 60A 케이블 100m 단면적 35mm2 500lx').cableSize).toBe(35);
    expect(analyzeCalcIntent('전압강하 계산 전압 380V 전류 60A 케이블 100m 단면적 35mm2 500lx').unreadNumbers)
      .toContain(500);
  });

  it('IEEE 1584 적용 범위 밖은 여전히 거부한다', () => {
    // arc-flash 는 208~15000V 에서만 유효한 모델이다. 환산이 된다고 해서
    // 154kV 를 받아들이면 안 된다.
    const intent = analyzeCalcIntent('아크 플래시 계산 154kV 단락전류 20kA 차단시간 0.2s 이격거리 600mm');
    expect(intent.extractedParams.voltage_V).toBeUndefined();
    expect(intent.canAutoExecute).toBe(false);
  });
});

/**
 * 업계 표준 용어로도 계산기에 닿는다.
 *
 * 현장은 계산기 이름으로 말하지 않는다 — "역률 보상 계산"이 아니라 콘덴서,
 * "에너지저장장치"가 아니라 배터리, "누전차단기 선정"이 아니라 ELCB 다.
 * 이건 말버릇이 아니라 업계 표준 용어라 어휘로 삼아도 흔들리지 않는다.
 *
 * 어휘의 정본은 손으로 쓴 동의어표가 아니라 이 리포의 IEC 60050 용어집
 * (151개, /glossary 가 쓰는 그 표)이다. 링크가 빠진 항목은 이름이 겹치는
 * 계산기가 정확히 하나일 때만 잇는다 — "전압"은 6종, "전류"는 7종에 걸려
 * 어느 쪽도 아니다(실측 2026-07-26).
 */
describe('업계 표준 용어 라우팅', () => {
  it.each([
    ['reactive-power', '역률 0.8에서 0.95로 올리려면 콘덴서 몇 kVA'],
    ['rcd-sizing', 'ELCB 정격감도전류 30mA 선정'],
    ['battery-capacity', '배터리 48V 200Ah 용량'],
    ['surge-arrester', '피뢰기 22.9kV 정격 선정'],
    ['inverter-capacity', '인버터 용량 100kW 태양광'],
  ])('%s — 표준 용어로 도달한다', (id, query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBe(id);
  });

  it.each([
    '변압기가 뭐야',
    '콘덴서 원리 설명해줘',
    'ELCB와 ELB 차이',
    '배터리 종류 알려줘',
    '피뢰기 설치 위치 규정',
    '태양광 발전 원리',
    // 용어도 맞고 수치도 있지만 조항을 묻는 질문 — 여기서 새면 조회가 계산이 된다.
    '접지저항 10Ω 기준은 어느 조항에 있어?',
  ])('용어만 스친 "%s" 는 계산기를 열지 않는다', (query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBeUndefined();
  });

  it('용어는 검색 파서 제안을 앞지르지 않는다', () => {
    // 이 질문은 cable-sizing 인데 "허용 전압강하 3%" 라는 용어를 품고 있다.
    // 용어를 앞에 두면 전압강하로 샌다 — 용어는 낱말 하나만 보기 때문이다.
    expect(analyzeCalcIntent('케이블 굵기 선정: 3상 380V 부하 100A 긍장 50m 허용 전압강하 3% 구리 도체').calculatorId)
      .toBe('cable-sizing');
  });
});
