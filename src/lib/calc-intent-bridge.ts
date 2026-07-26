/**
 * Calc Intent Bridge — Query Parser + Intent Parser -> Unified Calc Intent
 *
 * Bridges two independent NLP layers to produce a single actionable result:
 *   1. query-parser  (electrical NER + intent classification + calculator suggestion)
 *   2. intent-parser (NL -> tool mapping + numeric param extraction)
 *
 * PART 1: Types & constants
 * PART 2: Language detection helper
 * PART 3: Param name mapping (intent-parser names -> CALCULATOR_PARAMS names)
 * PART 4: analyzeCalcIntent() main function
 *
 * NOTE: Both parseQuery and parseIntent are pure-regex / in-memory functions
 * with no server-only imports. This module is safe for client-side use.
 */

import { parseQuery } from '@/search/query-parser';
import { parseIntent } from '@/engine/llm/intent-parser';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '@/lib/calculator-params';
import {
  matchCalculatorByExactName,
  matchCalculatorByName,
  extractScopedParams,
} from '@/lib/calculator-lexicon';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Unified result from analyzing a query for calculator intent */
export interface CalcIntentResult {
  /** Whether the query has a recognizable calculator intent */
  hasCalcIntent: boolean;
  /** Registry calculator ID (e.g. 'voltage-drop', 'cable-sizing') */
  calculatorId: string | undefined;
  /** Korean display name of the matched calculator */
  calculatorName: string | undefined;
  /** Parameters successfully extracted from the query text */
  extractedParams: Record<string, unknown>;
  /** Required params that have no extracted value and no default */
  missingRequired: ExtendedParamDef[];
  /** Optional params (have defaultValue) that were not extracted */
  missingOptional: ExtendedParamDef[];
  /** Full param definition list for the matched calculator */
  allParams: ExtendedParamDef[];
  /**
   * 질문에 적혀 있으나 어떤 파라미터로도 읽히지 못한 수치. 비어 있지 않으면
   * 사용자가 준 값을 흘린 것이므로 기본값으로 계산한 결과를 영수증으로 내지 않는다.
   */
  unreadNumbers: number[];
  /** True if all required params are satisfied (extracted or have defaults) */
  canAutoExecute: boolean;
  /** Merged confidence score from both parsers (0-1) */
  confidence: number;
}

/** Empty / no-intent result */
const NO_INTENT: CalcIntentResult = {
  hasCalcIntent: false,
  calculatorId: undefined,
  calculatorName: undefined,
  extractedParams: {},
  missingRequired: [],
  missingOptional: [],
  allParams: [],
  unreadNumbers: [],
  canAutoExecute: false,
  confidence: 0,
};

const EXPLICIT_TOOL_CALCULATOR_IDS: Record<string, string> = {
  calculate_voltage_drop: 'voltage-drop',
  calculate_cable_sizing: 'cable-sizing',
  calculate_breaker_sizing: 'breaker-sizing',
  calculate_short_circuit: 'short-circuit',
  calculate_transformer: 'transformer-capacity',
  calculate_grounding: 'ground-resistance',
  calculate_illumination: 'illuminance',
  calculate_load: 'max-demand',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Language Detection Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect language from query string.
 * Korean characters (Hangul) -> 'ko', else -> 'en'.
 */
function detectLang(text: string): string {
  const hangulCount = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return hangulCount >= latinCount ? 'ko' : 'en';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Param Name Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 의도 파서가 뽑은 키를 **그 계산기의** 파라미터명으로 옮긴다.
 *
 * 전역 치환표는 쓸 수 없다. 같은 `voltage` 가 voltage-drop 에서는 `voltage`,
 * short-circuit 에서는 `systemVoltage`, three-phase-power 에서는 `lineVoltage`
 * 이기 때문이다. 이전 코드는 전역표를 썼고, 그래서 `insulation → insulationType`·
 * `dropLimitPercent → maxDropPercent` 라는 전역 개명이 정작 그 이름을 그대로
 * 쓰는 cable-sizing 의 입력을 빼앗아 기본값으로 떨어뜨렸다(실측 2026-07-25 —
 * 기본값이 우연히 사용자 값과 같아 오래 드러나지 않았다).
 *
 * 목록에 없는 계산기·키는 이름 그대로 통과한다.
 */
const PARAM_ALIASES: Record<string, Record<string, string>> = {
  'short-circuit': { voltage: 'systemVoltage', transformerKVA: 'transformerCapacity', length: 'cableLength' },
  'breaker-sizing': { current: 'loadCurrent' },
  'three-phase-power': { voltage: 'lineVoltage', current: 'lineCurrent' },
  'ground-resistance': { length: 'rodLength' },
  'transformer-capacity': { transformerKVA: 'transformerCapacity' },
};

/** Remap intent-parser param names to the target calculator's param names. */
function mapParamNames(
  extracted: Record<string, unknown>,
  calculatorId: string,
): Record<string, unknown> {
  const aliases = PARAM_ALIASES[calculatorId] ?? {};
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    mapped[aliases[key] ?? key] = value;
  }
  return mapped;
}

/**
 * 질문에 적힌 수치 중 추출기가 **하나도 이해하지 못한** 값을 돌려준다.
 *
 * 계산기 파라미터는 거의 다 defaultValue 를 갖는다. 폼 UI 에서는 사용자가 그
 * 기본값을 눈으로 보고 고칠 수 있으니 옳은 설계지만, chat 영수증에서는 사용자가
 * 기본값을 보지 못한다. 그래서 추출이 실패하면 "사용자가 준 값"이 조용히 버려지고
 * **기본값으로 계산한 결과가 '검증된 계산기 영수증'으로** 모델에 주입된다.
 * 실측(2026-07-25): "면적 100제곱미터 … 조명률 0.6 보수율 0.8" 질문에서 추출 0건,
 * 영수증은 area=50·UF=0.5·MF=0.7 로 계산돼 24EA 를 확인 수치로 제시했다.
 *
 * 그래서 읽지 못한 수치가 하나라도 있으면 자동 실행하지 않는다. 판단 기준은
 * "이 계산기가 그 값을 쓰는가"가 아니라 "추출기가 그 값을 이해했는가"다 —
 * 차단기 질문의 "3상"처럼 그 계산기의 입력이 아닌 값도 있기 때문이다.
 */
/**
 * 읽어낸 값 속의 수치를 전부 모은다. 배열형 계산기(부하 목록·구간 목록)는 값이
 * 항목 안에 들어가므로 겉만 보면 "아무것도 못 읽었다"로 오판한다.
 */
function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (Array.isArray(value)) {
    for (const entry of value) collectNumbers(entry, into);
  } else if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) collectNumbers(entry, into);
  } else {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n) && value !== '' && value !== null) into.add(n);
  }
  return into;
}

function findUnreadNumbers(query: string, extracted: Record<string, unknown>): number[] {
  const read = collectNumbers(extracted);
  // 규격·조항 번호는 입력이 아니다. "IEEE 1584 아크플래시"·"KEC 232.3.9" 의
  // 숫자를 사용자가 준 값으로 세면 멀쩡한 질문이 되묻기로 떨어진다.
  const withoutReferences = query.replace(
    /\b(?:IEEE|IEC|KEC|NEC|KS|EN|BS|JIS|ISO|UL|ANSI)\s*[A-Z]?-?\s*[\d.]+/gi,
    ' ',
  );

  const unread: number[] = [];
  // 앞 글자가 문자·숫자·점이면 단위의 일부다(mm2 의 2, 232.3.9 의 9).
  for (const match of withoutReferences.matchAll(/(?:^|[^0-9A-Za-z가-힣.])(\d+(?:\.\d+)?)/g)) {
    const n = parseFloat(match[1]);
    if (!read.has(n) && !unread.includes(n)) unread.push(n);
  }
  return unread;
}

/**
 * 추출값·폼 입력을 계산기가 받는 타입으로 맞춘다.
 *
 * 의도 파서는 상수를 문자열로 준다(`phase: '3'`). 계산기는 숫자 3을 요구하므로
 * 변환 없이 넘기면 `phase must be one of [1, 3], got 3` 으로 떨어진다 — chat 은
 * 자체 변환이 있어 무사했고 홈·검색의 인라인 계산만 깨져 있었다(실측 2026-07-25,
 * 홈 히어로 예시 "전압강하 검토"가 그 경로다). 같은 변환을 두 벌 두지 않는다.
 *
 * 값이 숫자가 아니면 그 이름을 `invalid` 로 돌려준다 — 던지지 않는다. chat 은
 * 영수증을 포기하고, 폼은 그 항목을 사용자에게 되묻는다.
 */
export function coerceCalculatorInput(
  definitions: ExtendedParamDef[],
  values: Record<string, unknown>,
): { input: Record<string, unknown>; invalid: string[] } {
  const input: Record<string, unknown> = {};
  const invalid: string[] = [];
  for (const definition of definitions) {
    const raw = definition.name in values ? values[definition.name] : definition.defaultValue;
    if (raw === undefined) continue;
    if (definition.type === 'number') {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) {
        invalid.push(definition.name);
        continue;
      }
      input[definition.name] = value;
    } else if (definition.type === 'boolean') {
      input[definition.name] = Boolean(raw);
    } else {
      input[definition.name] = raw;
    }
  }
  return { input, invalid };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Analysis Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze a natural language query for calculator intent.
 *
 * Combines query-parser (calculator suggestion from keyword matching)
 * and intent-parser (numeric param extraction from NL text) into a
 * unified result indicating which calculator to run and with what params.
 *
 * Priority: parseQuery's `suggestedCalculator` (registry ID) takes precedence
 * over parseIntent's `tool` field, since the registry IDs directly map to
 * CALCULATOR_PARAMS keys.
 *
 * @param query - Raw user input string (Korean or English)
 * @returns CalcIntentResult with extracted params and missing param analysis
 */
export function analyzeCalcIntent(query: string): CalcIntentResult {
  // 1. 검색 파서(계산기 6종만 제안 가능)와 도메인 의도 파서를 **둘 다** 태운다.
  const parsed = parseQuery(query);
  const lang = detectLang(query);
  const intentResult = parseIntent(query, lang);

  // 2. 전기 키워드는 의도 파서가 더 정확히 안다. 명시 도구가 고신뢰로 잡히면
  //    그것을 정본으로 쓴다.
  const explicitCalculatorId = intentResult.intent === 'calculate'
    && intentResult.confidence >= 0.8
    && intentResult.tool
    ? EXPLICIT_TOOL_CALCULATOR_IDS[intentResult.tool]
    : undefined;

  // 3. 게이트 — **의도**는 parseQuery 가 정본, **계산기 이름**은 둘 중 아는 쪽.
  //
  // parseQuery 는 질문 형태를 보고 calculate / search / definition / standard_lookup
  // 을 정확히 가른다. 반면 계산기는 6종(cable-sizing·short-circuit·single/three-
  // phase-power·transformer-capacity·voltage-drop)밖에 **이름을 대지 못한다**.
  // 이전 코드는 이 둘을 한 조건에 묶어 "이름을 못 대면 의도도 없다"로 처리했다.
  // 그래서 "조도 계산"·"최대수요전력 계산"은 의도가 calculate 로 옳게 잡히고도
  // NO_INTENT 로 떨어졌고, breaker-sizing·ground-resistance 가 통과한 것은 질문에
  // 검색 파서가 아는 단어가 **우연히** 섞였기 때문이었다(실측 2026-07-25: 매핑
  // 8종 중 5종만 실행). 도달하지 못하면 모델이 직접 답하려 하고 출력 필터가 그
  // 수치를 막아, known-answer 로 검증된 계산기를 두고도 사용자는 "[BLOCKED]입니다"
  // 같은 깨진 문장을 받는다.
  //
  // 의도 판정까지 우회하면 안 된다 — 실측(전후 차분)상 "KEC 232.3.9 전압강하 조항
  // 원문"·"전압강하가 생기는 이유"처럼 키워드만 겹치는 규정·개념 질문 5건이 전부
  // 계산기로 새어 홈 화면이 검색 대신 계산 패널을 띄웠다. 그 판정은 parseQuery 가
  // 이미 옳게 하고 있으므로 그대로 존중한다.
  // 계산기 선택 순서.
  //   ① 이름 전체가 질의에 들어 있으면 그것 — 가장 흔들리지 않는 신호다.
  //      "케이블 사이징: … 허용 전압강하 3%" 를 의도 파서는 voltage-drop 으로
  //      짚는다(실측). 사용자가 이름을 통째로 말했으면 그 말을 믿는다.
  //   ② 의도 파서의 명시 도구 — 실측으로 검증된 8종.
  //   ③ 검색 파서의 제안 — 6종.
  //   ④ 이름 토큰 점수 — 나머지를 위한 최하위 폴백.
  //
  // 앞의 둘은 합쳐도 10종밖에 이름을 대지 못하는데 계산기는 57종이다. 나머지
  // 47종은 이 경로가 없으면 어떤 질문으로도 도달할 수 없다.
  // 이름 전체가 나왔을 때, 그 계산기의 입력을 **수치로** 실제 읽어냈는지가
  // "계산해달라"와 "그 기준이 어디 있냐"를 가른다. 아래 §6 참조.
  const namedCalculatorId = matchCalculatorByExactName(query);
  const namedScopedParams = namedCalculatorId
    ? extractScopedParams(query, CALCULATOR_PARAMS[namedCalculatorId] ?? [])
    : {};
  const openedByName = namedCalculatorId !== undefined
    && collectNumbers(namedScopedParams).size > 0;

  const calculatorId = (openedByName ? namedCalculatorId : undefined)
    ?? explicitCalculatorId
    ?? parsed.suggestedCalculator
    // 토큰 점수 폴백은 검색 파서가 이미 계산이라고 본 질문에만 쓴다 — 이 매칭은
    // 비계산 질의 10건 중 7건에 반응할 만큼 헐겁다(실측).
    ?? (parsed.intent === 'calculate' ? matchCalculatorByName(query) : undefined);
  if (!calculatorId) {
    return { ...NO_INTENT };
  }

  // 4. Get the calculator's param definitions from CALCULATOR_PARAMS
  const paramDefs = CALCULATOR_PARAMS[calculatorId];
  if (!paramDefs || paramDefs.length === 0) {
    // Calculator ID exists in keyword map but has no param definitions
    return { ...NO_INTENT };
  }

  // 5. 값 읽기 — 계산기가 정해졌으므로 그 계산기의 파라미터 정의를 어휘로 쓸 수
  //    있다. 전역 패턴(의도 파서 12종)은 하위 호환을 위해 유지하되, 범위를 좁혀
  //    읽은 값이 더 확실하므로 그쪽이 이긴다.
  const scopedParams = calculatorId === namedCalculatorId
    ? namedScopedParams
    : extractScopedParams(query, paramDefs);
  // 전역 파서는 계산기를 모른 채 12종 패턴으로 읽는다. 그 결과에는 이 계산기에
  // 없는 파라미터가 섞여 들어온다 — 그리고 그게 "값을 읽었다"로 세어졌다.
  //
  // 실측(2026-07-26): "조도 계산 케이블 길이 10m" → mappedParams {length:10}.
  // illuminance 에 length 는 없다. 그런데 unreadNumbers 는 10 을 읽은 것으로
  // 치고 비었고, readSomething 은 true 가 됐다 → canAutoExecute:true →
  // area=50·UF=0.5·MF=0.7 전부 기본값으로 만든 결과가 "검증된 영수증" 이 됐다.
  // "가로 10m 세로 8m" 질문에서도 10 만 미확인 목록에서 빠져, 읽지도 않은 값을
  // 읽은 것처럼 보고했다.
  //
  // 이 계산기가 실제로 가진 파라미터만 남긴다. 남지 못한 수치는 그대로
  // unreadNumbers 로 드러나 자동 실행을 막는다.
  const paramNames = new Set(paramDefs.map((p) => p.name));
  const mappedParams = Object.fromEntries(
    Object.entries({
      ...mapParamNames(intentResult.extractedParams, calculatorId),
      ...scopedParams,
    }).filter(([name]) => paramNames.has(name)),
  );

  // 6. 게이트 — parseQuery 의 의도 판정이 정본이되, 그 분류기가 모르는 계산기가 있다.
  //
  // parseQuery 는 "AWG↔mm² 변환"·"피뢰 시스템 설계"·"UPS 용량" 을 search 로,
  // "허용전류 비교"·"주파수 비교" 를 compare 로 분류한다(실측). 그래서 이름이
  // 정확히 맞아도 게이트에서 떨어져 11종이 도달 불가였다.
  //
  // 그렇다고 이름만으로 열 수는 없다. 같은 실측에서 이름 매칭은 비계산 질의
  // 10건 중 7건에 반응했다("KEC 전압강하 기준 알려줘" → voltage-drop).
  //
  // 둘을 가르는 신호는 데이터에 있었다. 계산 요청은 *수치 입력*을 준다(건물 높이
  // 30m 폭 20m / 고장전류 10kA 차단시간 0.5s). 조회 질문은 이름만 스치거나
  // 수치를 줘도 "그 기준이 어느 조항이냐"를 묻는다. 그래서 **이름 전체가 나오고
  // 그 계산기의 입력을 수치로 읽어냈을 때**만 계산 요청으로 본다.
  //
  // 선택지 값(도체 Cu, 등급 IE3)은 증거로 세지 않는다 — "전동기 효율 IE3 등급이
  // 뭐야"가 옵션 하나 맞았다고 계산기로 새면 안 된다(실측).
  if (parsed.intent !== 'calculate' && !openedByName) {
    return { ...NO_INTENT };
  }

  // 6. Determine which required params are missing
  //    "required" = no defaultValue AND not extracted
  const missingRequired: ExtendedParamDef[] = [];
  const missingOptional: ExtendedParamDef[] = [];

  for (const param of paramDefs) {
    const hasExtractedValue = param.name in mappedParams;
    const hasDefault = param.defaultValue !== undefined;

    if (!hasExtractedValue && !hasDefault) {
      // Truly missing — user must provide this
      missingRequired.push(param);
    } else if (!hasExtractedValue && hasDefault) {
      // Has a default, so it's optional / auto-filled
      missingOptional.push(param);
    }
  }

  // 6.5 역방향 계산기 차단 — 구해달라는 값을 입력으로 되묻지 않는다.
  //
  // 실측(2026-07-26): "3상 380V 55kW 유도전동기의 정격전류는?" 이 three-phase-power
  // (선간전압·선전류 → 전력)로 갔다. 그 계산기의 필수 입력이 바로 `lineCurrent`,
  // 즉 사용자가 구해달라는 값이다. 결과적으로 답변이 "계산기 실행을 위해 필요한
  // 입력인 **선전류(A)** 확인이 필요합니다" 가 됐다 — 묻는 값을 되물은 것이다.
  //
  // 필수 입력이 질문의 의문 대상과 겹치면 그 계산기는 이 질문의 역방향이다.
  // 다른 계산기를 짚을 근거는 없으므로 라우팅을 포기한다 — 그러면 모델이 원리와
  // 공식으로 답한다(수치는 출력 필터가 계속 막는다).
  const asksFor = (param: ExtendedParamDef): boolean => {
    const base = (param.description ?? '').replace(/\s*\([^)]*\)/g, '').trim();
    // 한국어 합성명사는 머리명사가 뒤에 온다. 파라미터는 "선전류" 라고 부르는데
    // 사용자는 "정격전류" 라고 묻는다 — 둘 다 전류다. 그래서 뒤 두 글자도 본다.
    const head = /^[가-힣]{3,}$/.test(base) ? base.slice(-2) : '';
    const terms = [base, head, param.name].filter((t) => t.length >= 2);

    return terms.some((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?\s+/g, '\\s*');
      // 물음의 대상 자리만 본다: "…전류는?" · "…전류가 얼마" · "…전류 몇 A".
      // "계산해"·"구해" 같은 동사는 넣지 않는다 — "전압강하 계산해줘" 처럼 정상
      // 요청에서도 걸려 멀쩡한 라우팅을 막는다.
      return new RegExp(`${escaped}\\s*(?:은|는|이|가)?\\s*(?:\\?|얼마|몇)`, 'i').test(query);
    });
  };
  // 필수만 보면 놓친다. 실측한 three-phase-power 의 `lineCurrent` 는 기본값이
  // 있어 missingOptional 로 빠졌는데, 기본값이 있다는 건 오히려 더 나쁘다 —
  // 사용자가 구해달라는 전류를 임의 값으로 채워 계산할 수 있다는 뜻이다.
  if ([...missingRequired, ...missingOptional].some(asksFor)) {
    return { ...NO_INTENT };
  }

  // 7. canAutoExecute = 필수 입력이 모두 있고, 질문의 수치를 하나도 흘리지 않았을 때만.
  const unreadNumbers = findUnreadNumbers(query, mappedParams);
  // 질문에서 읽어낸 값이 하나도 없으면 영수증을 만들지 않는다. 그런 결과는 전부
  // 기본값으로 계산한 것이라 사용자의 계산이 아니다 — "UPS 용량 산정 방법
  // 설명해줘"처럼 수치가 0개인 질문은 못 읽은 수치도 0이라 위의 가드를 그냥
  // 통과해 버린다(실측). 파라미터가 전부 defaultValue 를 가진 계산기에서 특히
  // 위험하다.
  const readSomething = collectNumbers(mappedParams).size > 0;
  const canAutoExecute = missingRequired.length === 0
    && unreadNumbers.length === 0
    && readSomething;

  // 8. Merge confidence from both parsers
  //    parseQuery doesn't return confidence, so use intent-parser's
  //    confidence boosted if parseQuery also agreed on the intent.
  const baseConfidence = intentResult.confidence;
  const confidence = Math.min(
    1.0,
    // 사용자가 계산기 이름을 통째로 말하고 그 입력까지 줬으면, 어느 계산기인지에
    // 대한 불확실성은 없다. 의도 파서는 도구 8종만 알아서 나머지 49종에는 낮은
    // 확신도를 남기는데, 영수증 발행 문턱이 0.8 이라 그것 때문에 정상 라우팅된
    // 계산기가 결과를 못 내고 있었다(실측: "UPS 용량: 부하 50kW 역률 0.9" —
    // 계산기는 정상 실행되는데 확신도에서 막힘).
    openedByName
      ? Math.max(baseConfidence, 0.9)
      : baseConfidence + (parsed.intent === 'calculate' ? 0.05 : 0),
  );

  // 9. Get calculator display name
  const nameEntry = CALCULATOR_NAMES[calculatorId];

  return {
    hasCalcIntent: true,
    calculatorId,
    calculatorName: nameEntry?.name,
    extractedParams: mappedParams,
    missingRequired,
    missingOptional,
    allParams: paramDefs,
    unreadNumbers,
    canAutoExecute,
    confidence,
  };
}
