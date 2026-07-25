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
   * 필수 입력이 배열이라 한 문장으로 줄 수 없는 계산기. 라우팅은 되어야 하지만
   * (무엇을 계산할지는 알아야 한다) 자동 실행은 하지 않고 빠진 것을 알린다.
   */
  it('배열 입력 계산기는 라우팅되되 자동 실행하지 않는다', () => {
    const intent = analyzeCalcIntent(ROUTES.find((r) => r.id === 'max-demand')!.query);
    expect(intent.calculatorId).toBe('max-demand');
    expect(intent.canAutoExecute).toBe(false);
    expect(intent.missingRequired.map((p) => p.name)).toContain('loads');
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
