import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import type { DetailedCalcResult } from '@/engine/calculators';
import { analyzeCalcIntent, coerceCalculatorInput } from '@/lib/calc-intent-bridge';
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
 * 완전한 자연어 계산 입력만 정본 계산기로 실행한다. 파라미터가 빠졌거나
 * 파서 확신도가 낮으면 null을 반환해 LLM이 누락 입력만 설명하게 한다.
 */
export function resolveChatCalculationEvidence(query: string): ChatCalculationEvidence | null {
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
      return '\n\n계산 요청이지만 이 질문에 맞는 검증된 ESA 계산기를 지목하지 못했습니다.\n수치를 직접 만들어 제시하지 마세요. 대신 ① 적용 공식을 기호로, ② 각 기호에 해당하는 입력값이 무엇인지, ③ 어떤 계산기·기준을 봐야 하는지를 설명하세요.\n질문에 이미 주어진 값은 그대로 인용해도 됩니다.';
    }
    return asksForTableValue(query) ? LOOKUP_SHORTFALL : null;
  }
  if (intent.canAutoExecute && resolveChatCalculationEvidence(query)) return null;

  const needed = [...intent.missingRequired, ...intent.missingOptional]
    .map((p) => `${p.description}${p.unit ? ` (${p.unit})` : ''}`)
    .slice(0, 8);
  const unread = intent.unreadNumbers.length > 0
    ? `\n질문에 있으나 앱이 어느 입력인지 읽지 못한 수치: ${intent.unreadNumbers.join(', ')} — 각각 무엇의 값인지 확인하세요.`
    : '';

  return `\n\n계산 요청이지만 검증된 ESA 계산기(${intent.calculatorName ?? intent.calculatorId})를 실행할 입력이 확정되지 않았습니다.\n직접 계산해서 수치를 제시하지 마세요. 대신 필요한 입력을 구체적으로 되물으세요.\n필요한 입력: ${needed.join(', ') || '없음'}${unread}\n일반 원리·공식·판단 기준은 수치 없이 설명해도 됩니다.`;
}
