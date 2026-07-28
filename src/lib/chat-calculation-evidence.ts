import { CALCULATOR_REGISTRY, normalizeUnit } from '@/engine/calculators';
import type { DetailedCalcResult } from '@/engine/calculators';
import { analyzeCalcIntent, coerceCalculatorInput } from '@/lib/calc-intent-bridge';
import { extractScopedParams } from '@/lib/calculator-lexicon';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';
import { parseQuery } from '@/search/query-parser';

export interface ChatCalculationEvidence {
  calculatorId: string;
  calculatorName: string;
  input: Record<string, unknown>;
  result: Pick<DetailedCalcResult, 'value' | 'unit' | 'formula' | 'steps' | 'additionalOutputs' | 'judgment'>;
  /** 질문에 없어 앱이 기본값으로 채운 입력. 답변에서 가정으로 밝혀야 한다. */
  assumed: string[];
  trustedText: string;
  promptContext: string;
}


/**
 * 단위 환산 질문만 따로 읽는다.
 *
 * 범용 의도 브리지는 이 모양을 못 읽는다(실측 2026-07-28):
 *   "0.4kV는 몇 V야?"                  → 계산기 미지목
 *   "380V를 kV로 바꿔줘"                → 계산기 미지목
 *   "전기 단위 환산: 값 0.4, 현재 kV, 바꿀 V" → 지목되지만 `toUnit` 을 kV 로
 *                                        잘못 뽑는다(옵션이 같은 종류라 앞의
 *                                        것이 두 자리에 다 붙는다)
 *
 * 브리지를 고치면 57 종이 함께 흔들린다. 환산 질문은 모양이 좁고 분명해서
 * (`<수치><단위>` 하나 + 숫자 없는 목표 단위 하나) 여기서 직접 읽는 편이
 * 안전하다.
 *
 * **환산 의도가 없으면 읽지 않는다.** "380V 100A 전압강하 계산해줘" 에도
 * 단위가 둘 있지만 그건 환산 요청이 아니다.
 */
const CONVERSION_INTENT = /(환산|변환|바꿔|바꾸|몇\s*[A-Za-z㎸㎾㎿Ω]|얼마|→|->)/;
const NUMBER_WITH_UNIT = /(-?\d+(?:\.\d+)?)\s*(k?[Vv]|m[VvAa]|k?[Aa]|[Mk]?W|[Mk]?VA|[Mk]?var|k?Ω|m?Ω|k?[Hh]z|k?m|mm|[Mk]?Wh)\b/g;
const BARE_UNIT = /(?:^|[\s(,를을로으로]) ?(k?V|mV|mA|kA|A|MW|kW|W|MVA|kVA|VA|Mvar|kvar|var|kΩ|mΩ|Ω|kHz|Hz|km|mm|m|MWh|kWh|Wh)\b/g;

function resolveUnitConversion(query: string): ChatCalculationEvidence | null {
  if (!CONVERSION_INTENT.test(query)) return null;

  NUMBER_WITH_UNIT.lastIndex = 0;
  const source = NUMBER_WITH_UNIT.exec(query);
  if (!source) return null;
  // 수치가 둘 이상이면 환산이 아니라 계산이다 — 손대지 않는다.
  if (NUMBER_WITH_UNIT.exec(query)) return null;

  const fromUnit = normalizeUnit(source[2]);
  if (!fromUnit) return null;

  // 목표 단위는 수치 뒤에, 숫자 없이 나온다.
  const tail = query.slice(source.index + source[0].length);
  BARE_UNIT.lastIndex = 0;
  let target: string | null = null;
  let hit: RegExpExecArray | null;
  while ((hit = BARE_UNIT.exec(tail)) !== null) {
    const candidate = normalizeUnit(hit[1]);
    if (candidate && candidate !== fromUnit) { target = candidate; break; }
  }
  if (!target) return null;

  const calculator = CALCULATOR_REGISTRY.get('unit-converter');
  if (!calculator) return null;
  const input = { value: Number(source[1]), fromUnit: source[2], toUnit: hit![1] };
  try {
    const calculated = calculator.calculator(input as never);
    const result = {
      value: calculated.value,
      unit: calculated.unit,
      formula: calculated.formula,
      steps: calculated.steps,
      additionalOutputs: calculated.additionalOutputs,
      judgment: calculated.judgment,
    };
    const trustedText = JSON.stringify({ calculatorId: calculator.id, input, result });
    return {
      calculatorId: calculator.id,
      calculatorName: calculator.name,
      input,
      result,
      assumed: [],
      trustedText,
      promptContext: `\n\n검증된 ESA 계산기 영수증:\n${trustedText}`
        + '\n위 영수증의 입력과 결과만 [확인] 수치로 사용하고, 결과 뒤에'
        + ` [SOURCE: ESA_CALCULATOR:${calculator.id}]를 붙이세요.`
        + ' 영수증에 없는 수치나 새로운 반올림 수치를 만들지 마세요.'
        + ' judgment 가 실패면 그 사유를 그대로 전하고 임의로 환산하지 마세요'
        + ' — 물리량이 다르면 단위 환산으로는 갈 수 없습니다.',
    };
  } catch {
    return null;
  }
}

/**
 * 앞 turn 의 계산을 이어받아 값 하나만 바꾼 후속 질문을 푼다.
 *
 * "전압 380V 전류 100A 길이 50m 35sq 전압강하 계산해줘" 다음에 "그럼 길이를
 * 100m 로 늘리면?" 이 오면, 지금까지는 되물었다. 마지막 메시지만 보기
 * 때문이다. 수치를 지어내지 않는다는 점에서 **안전한 쪽으로 틀렸지만**
 * 자연스러운 후속이 매번 막힌다.
 *
 * 그냥 대화를 이어붙이면 위험하다. 실측 2026-07-28:
 *   · 앞뒤로 붙이면 **앞의 값이 이긴다** — 후속의 100m 가 무시되고 낡은
 *     50m 로 계산된 영수증이 나갔다.
 *   · 무관한 후속("그건 왜 그래?")에도 앞 turn 값이 다 살아나 **묻지도
 *     않은 계산의 영수증**이 붙었다.
 *
 * 그래서 좁게 연다:
 *   ① 앞 turn 중 **실제로 영수증이 나온** 것만 바탕으로 삼는다(그 값들은
 *      한 번 계산에 쓸 만하다고 확인된 것이다).
 *   ② 후속에서 **그 계산기의 파라미터를 실제로 다시 말했을 때만** 잇는다.
 *      "그건 왜 그래?" 는 아무 값도 안 주므로 이어지지 않는다.
 *   ③ 후속이 말한 값이 앞의 값을 덮는다.
 *   ④ 이어받은 값을 **답변에서 밝히게** 한다 — 사용자는 앞의 조건이
 *      그대로 쓰였다는 걸 알아야 한다.
 */
function resolveFollowUp(
  latest: string,
  priorUserTexts: readonly string[],
): ChatCalculationEvidence | null {
  for (let i = priorUserTexts.length - 1; i >= 0; i -= 1) {
    const base = resolveSingleTurn(priorUserTexts[i]);
    if (!base) continue;
    const defs = CALCULATOR_PARAMS[base.calculatorId];
    if (!defs) return null;

    const changed = extractScopedParams(latest, defs).values;
    if (Object.keys(changed).length === 0) return null;   // ② 다시 말한 값이 없다

    const calculator = CALCULATOR_REGISTRY.get(base.calculatorId);
    if (!calculator) return null;
    const merged = { ...base.input, ...changed };          // ③ 후속이 이긴다
    try {
      const calculated = calculator.calculator(merged as never);
      const carried = Object.entries(base.input)
        .filter(([name]) => !(name in changed))
        .map(([name, value]) => {
          const def = defs.find((p) => p.name === name);
          return `${def?.description ?? name}=${String(value)}${def?.unit ? ` ${def.unit}` : ''}`;
        });
      const result = {
        value: calculated.value,
        unit: calculated.unit,
        formula: calculated.formula,
        steps: calculated.steps,
        additionalOutputs: calculated.additionalOutputs,
        judgment: calculated.judgment,
      };
      const trustedText = JSON.stringify({ calculatorId: calculator.id, input: merged, result });
      return {
        calculatorId: calculator.id,
        calculatorName: calculator.name,
        input: merged,
        result,
        assumed: carried,
        trustedText,
        promptContext: `\n\n검증된 ESA 계산기 영수증(앞선 조건을 이어받아 다시 계산):\n${trustedText}`
          + (carried.length > 0
            ? `\n앞 대화에서 그대로 가져온 값: ${carried.join(', ')} — 답변 첫머리에 이 조건들을 그대로 쓴다고 밝히고, 바꾸고 싶으면 말해 달라고 하세요.`
            : '')
          + `\n위 영수증의 입력과 결과만 [확인] 수치로 사용하고, 결과 뒤에 [SOURCE: ESA_CALCULATOR:${calculator.id}]를 붙이세요.`
          + ' 영수증에 없는 수치나 새로운 반올림 수치를 만들지 마세요.',
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 완전한 자연어 계산 입력만 정본 계산기로 실행한다. 파라미터가 빠졌거나
 * 파서 확신도가 낮으면 null을 반환해 LLM이 누락 입력만 설명하게 한다.
 *
 * `priorUserTexts` 는 앞 turn 의 사용자 발화다(오래된 것부터). 마지막
 * 메시지만으로 영수증이 안 나올 때 후속 병합을 시도한다.
 */
function resolveSingleTurn(query: string): ChatCalculationEvidence | null {
  const conversion = resolveUnitConversion(query);
  if (conversion) return conversion;

  const intent = analyzeCalcIntent(query);
  if (!intent.hasCalcIntent || !intent.canAutoExecute || intent.confidence < 0.8 || !intent.calculatorId) return null;
  const calculator = CALCULATOR_REGISTRY.get(intent.calculatorId);
  if (!calculator) return null;

  try {
    const { input, invalid } = coerceCalculatorInput(intent.allParams, intent.extractedParams);
    if (invalid.length > 0) return null;
    const calculated = calculator.calculator(input);
    const result = {
      value: calculated.value,
      unit: calculated.unit,
      formula: calculated.formula,
      steps: calculated.steps,
      additionalOutputs: calculated.additionalOutputs,
      judgment: calculated.judgment,
    };
    // 질문에서 읽은 값과 앱이 채운 기본값을 갈라 둔다.
    //
    // 영수증은 둘을 섞어 하나의 input 으로 넘기는데, chat 에서는 사용자가 폼을
    // 보지 못해 무엇이 가정인지 알 수 없다. 가정은 답을 크게 흔든다 — 실측
    // 2026-07-26: "케이블 100m 전류 60A 전압 380V 단면적 35mm2" 는 상수·도체·
    // 역률이 없어 phase=3·Cu·pf=0.85 로 채워졌고, 단상이면 같은 조건에서
    // 4.79V 가 아니라 5.53V 다(15% 차이).
    const readFromQuestion = new Set(Object.keys(intent.extractedParams));
    const assumed = Object.entries(input)
      .filter(([name]) => !readFromQuestion.has(name))
      .map(([name, value]) => {
        const def = intent.allParams.find((p) => p.name === name);
        return `${def?.description ?? name}=${String(value)}${def?.unit ? ` ${def.unit}` : ''}`;
      });

    const trustedText = JSON.stringify({ calculatorId: calculator.id, input, result });
    return {
      calculatorId: calculator.id,
      calculatorName: intent.calculatorName ?? calculator.name,
      input,
      result,
      trustedText,
      assumed,
      promptContext: `\n\n검증된 ESA 계산기 영수증:\n${trustedText}${
        assumed.length > 0
          ? `\n질문에 없어 앱이 채운 입력: ${assumed.join(', ')} — 답변에서 이 값들을 가정으로 명시하고, 조건이 다르면 결과가 달라진다고 알리세요.`
          : ''
      }\n위 영수증의 입력과 결과만 [확인] 수치로 사용하세요. 계산 결과 뒤에 [SOURCE: ESA_CALCULATOR:${calculator.id}]를 붙이고, 영수증에 없는 수치나 새로운 반올림 수치를 만들지 마세요. 역산은 영수증 단계가 일치한다고 문자로 확인하고 별도 수치를 재계산하지 마세요. judgment는 앱에 설정된 계산기 기준에 대한 판정으로 명시하되 법적 적합 인증으로 표현하지 마세요. 계산기 source에 포함된 규정 조항은 원문 조회가 아니므로 직접 인용하지 마세요.`,
    };
  } catch {
    return null;
  }
}

/**
 * 채팅 한 번에 대한 계산 근거.
 *
 * 마지막 메시지만으로 영수증이 나오면 그것을 쓴다. 안 나오면 앞 turn 을
 * 이어받아 다시 본다 — 이어받기는 `resolveFollowUp` 의 네 조건 안에서만
 * 일어난다.
 */
export function resolveChatCalculationEvidence(
  query: string,
  priorUserTexts: readonly string[] = [],
): ChatCalculationEvidence | null {
  return resolveSingleTurn(query) ?? resolveFollowUp(query, priorUserTexts);
}

/**
 * 공식을 쓸 때의 규칙.
 *
 * "수치 없이 설명해도 됩니다" 만으로는 부족했다. 모델은 공식의 **상수**를
 * 수치로 여기지 않아 `e = 30.8·L·I/(1000·A)` 처럼 적고, 출력 검증이 그
 * 상수를 지워 `e = [미확인]·L·I/([미확인]·A)` 가 됐다. 라이브 실측
 * 2026-07-28: "전압강하 계산해줘" 한 번에 공식 3 개가 전부 뚫리고
 * `[미확인]` 이 8 개 나왔다. 구멍 난 공식은 안 보여 주느니만 못하다.
 *
 * 상수도 기호로 두라고 명시한다. 값은 계산기가 적용한다.
 */
const SYMBOLIC_FORMULA_RULE = '\n공식에는 **숫자를 하나도 쓰지 마세요.** 계수도 단위 환산 상수도'
  + ' 전부 기호로 두고 기호가 무엇인지만 밝히세요(예: `e = k·L·I/A`, k 는 배선 방식과'
  + ' 단위 환산을 포함한 상수). 숫자를 적으면 출력 검증이 그 숫자를 지워 공식이 읽을 수'
  + ' 없게 됩니다 — 상수의 실제 값은 계산기가 적용합니다.';

/**
 * 표·규정에서 **수치를 꺼내 오는** 질문인가.
 *
 * `parseQuery` 는 "케이블 35sq 허용전류 알려줘" 를 `calculate` 가 아니라
 * `search` 로 분류한다 — 맞는 분류다. 사용자는 계산을 시키는 게 아니라
 * 표 값을 묻고 있다. 문제는 그 뒤다: 계산기도 안 걸리고 `calculate` 도
 * 아니니 **아무 지시도 안 붙고**, 모델이 기억에서 수치를 써 내면 출력
 * 필터가 전부 [미확인] 으로 지운다.
 *
 * 실측 2026-07-28, 이 앱 사용자가 실제로 물을 세 문장:
 *   "케이블 35sq 허용전류 알려줘"
 *     → "허용전류는 관로 포설 기준 **[미확인]**입니다. 주위온도 **[미확인]**도"
 *   "100AF 차단기에 4sq 케이블 써도 되나요?"
 *     → "최소 **[미확인]** 이상을 권장합니다"
 *   "MCCB 225AT에 맞는 케이블 굵기는?"
 *     → "CV 동도체 관로 기준 **[미확인]([미확인])**를 권장합니다"
 * 필터는 제 일을 했다. 빠진 것은 **쓰기 전에 알려 주는 지시**다.
 *
 * 판별은 좁게 잡는다 — **단위가 붙은 수치**가 있거나, 답이 표에서 나오는
 * 값 이름이 있을 때만.
 *
 * 그냥 "숫자가 있으면" 으로 잡았더니 `KEC 232.5 조항이 뭔가요` 가 걸렸다
 * (조항 번호도 숫자다). 기존 잠금이 그걸 잡아냈다 — 과잉 지시는 답을
 * 망친다는 결정이 이미 테스트에 박혀 있었다. 조항 번호·날짜·모델명에는
 * 단위가 안 붙는다는 것이 두 부류를 가르는 실제 차이다.
 */
const TABLE_VALUE_TERMS = [
  '허용전류', '굵기', '단면적', '정격', '접지저항', '절연저항', '이격거리',
  '이격', '용량', '차단용량', '보정계수', '수용률', '부하율',
];

/** `35sq` · `100AF` · `380V` · `50m` 처럼 단위가 바로 붙은 수치. */
const UNIT_BEARING_NUMBER = /\d+(?:\.\d+)?\s*(?:sq|mm2|mm²|㎟|kVA|kVAR|kV|kW|AF|AT|A|V|W|m|Ω|ohm|%)\b/i;

function asksForTableValue(query: string): boolean {
  return UNIT_BEARING_NUMBER.test(query) || TABLE_VALUE_TERMS.some((term) => query.includes(term));
}

/**
 * 앱에 실제로 있는 계산기 이름표.
 *
 * 시스템 프롬프트는 모델에게 "실행할 계산기" 를 대라고 시키는데 **계산기
 * 이름을 하나도 알려 주지 않는다**(실측 2026-07-28: 프롬프트에 계산기명 0).
 * 모르는 목록에서 이름을 대라고 하면 지어낸다. 없는 기능을 안내받은
 * 사용자는 앱을 뒤지다 못 찾는다.
 *
 * 레지스트리에서 뽑으므로 계산기를 추가하면 목록도 함께 는다. 붙이는 곳은
 * **되묻기 경로뿐** 이다 — 평상시 답변에는 이 840 여 토큰을 싣지 않는다.
 * 계산기 이름을 대라고 요구하는 자리가 거기뿐이기 때문이다.
 */
function calculatorRoster(): string {
  const names = [...CALCULATOR_REGISTRY.values()]
    .map((entry) => `${entry.id}(${entry.name})`)
    .join(' · ');
  return `\n앱에 있는 계산기: ${names}`
    + '\n계산기를 안내할 때는 이 목록의 이름만 쓰세요. 목록에 없으면 "해당 계산기는 없습니다" 라고 하고 지어내지 마세요.';
}

const LOOKUP_SHORTFALL = '\n\n이 질문은 표·규정에서 수치를 꺼내는 조회이고, 검증된 ESA 계산기 영수증이 없습니다.'
  + '\n기억에 있는 표 값(허용전류·굵기·보정계수·이격거리 등)을 수치로 적지 마세요 — 출력 검증이 그런 수치를 지웁니다.'
  + '\n대신 ① 어떤 표·조항을 봐야 하는지, ② 그 표를 읽으려면 무엇이 확정돼야 하는지(도체·절연·포설방식·주위온도·회로 수 등),'
  + ' ③ 앱의 어느 계산기·검토 기능이 그 답을 내는지를 알려 주세요.'
  + '\n질문에 이미 주어진 값은 그대로 인용해도 됩니다.';

/**
 * 계산 요청인데 정본 계산기를 돌리지 못한 경우의 프롬프트.
 *
 * 영수증이 없으면 지금까지는 시스템 프롬프트에 아무것도 붙지 않았고, 모델은
 * 스스로 계산해 수치를 썼다. 그 수치는 영수증에 없으므로 출력 필터가 전부
 * 지웠고, 사용자에게는 "합성 최대수요전력은 **[BLOCKED: Tool 호출 필요]**입니다"
 * 같은 문장만 남았다(실측 2026-07-25). 필터는 제 일을 한 것이고, 빠진 것은
 * **계산하지 말고 무엇이 필요한지 물으라**는 지시다.
 */
export function resolveChatCalculationShortfall(query: string): string | null {
  const intent = analyzeCalcIntent(query);

  // 계산 요청인데 맞는 계산기를 못 찾은 경우도 지시가 필요하다.
  //
  // 계산기를 지목하지 못하면 지금까지는 아무 지시도 붙지 않았고, 모델은 스스로
  // 끝까지 계산했다. 그 수치는 영수증에 없으니 출력 필터가 전부 지웠고 사용자는
  // "[미확인] ÷ [미확인] ≈ [미확인]" 같은 답을 받았다(실측 2026-07-26, 한 답변에
  // 6개). 공식과 필요한 입력을 기호로 설명하는 것이 그보다 훨씬 쓸모 있다.
  if (!intent.calculatorId) {
    if (parseQuery(query).intent === 'calculate') {
      return '\n\n계산 요청이지만 이 질문에 맞는 검증된 ESA 계산기를 지목하지 못했습니다.\n수치를 직접 만들어 제시하지 마세요. 대신 ① 적용 공식을 기호로, ② 각 기호에 해당하는 입력값이 무엇인지, ③ 어떤 계산기·기준을 봐야 하는지를 설명하세요.\n질문에 이미 주어진 값은 그대로 인용해도 됩니다.'
        + SYMBOLIC_FORMULA_RULE
        + calculatorRoster();
    }
    return asksForTableValue(query) ? LOOKUP_SHORTFALL + calculatorRoster() : null;
  }
  if (intent.canAutoExecute && resolveChatCalculationEvidence(query)) return null;

  const needed = [...intent.missingRequired, ...intent.missingOptional]
    .map((p) => `${p.description}${p.unit ? ` (${p.unit})` : ''}`)
    .slice(0, 8);
  const unread = intent.unreadNumbers.length > 0
    ? `\n질문에 있으나 앱이 어느 입력인지 읽지 못한 수치: ${intent.unreadNumbers.join(', ')} — 각각 무엇의 값인지 확인하세요.`
    : '';

  return `\n\n계산 요청이지만 검증된 ESA 계산기(${intent.calculatorName ?? intent.calculatorId})를 실행할 입력이 확정되지 않았습니다.\n직접 계산해서 수치를 제시하지 마세요. 대신 필요한 입력을 구체적으로 되물으세요.\n필요한 입력: ${needed.join(', ') || '없음'}${unread}\n일반 원리·공식·판단 기준은 수치 없이 설명해도 됩니다.${SYMBOLIC_FORMULA_RULE}`;
}
