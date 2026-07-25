import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import type { DetailedCalcResult } from '@/engine/calculators';
import { analyzeCalcIntent, coerceCalculatorInput } from '@/lib/calc-intent-bridge';

export interface ChatCalculationEvidence {
  calculatorId: string;
  calculatorName: string;
  input: Record<string, unknown>;
  result: Pick<DetailedCalcResult, 'value' | 'unit' | 'formula' | 'steps' | 'additionalOutputs' | 'judgment'>;
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
    const trustedText = JSON.stringify({ calculatorId: calculator.id, input, result });
    return {
      calculatorId: calculator.id,
      calculatorName: intent.calculatorName ?? calculator.name,
      input,
      result,
      trustedText,
      promptContext: `\n\n검증된 ESA 계산기 영수증:\n${trustedText}\n위 영수증의 입력과 결과만 [확인] 수치로 사용하세요. 계산 결과 뒤에 [SOURCE: ESA_CALCULATOR:${calculator.id}]를 붙이고, 영수증에 없는 수치나 새로운 반올림 수치를 만들지 마세요. 역산은 영수증 단계가 일치한다고 문자로 확인하고 별도 수치를 재계산하지 마세요. judgment는 앱에 설정된 계산기 기준에 대한 판정으로 명시하되 법적 적합 인증으로 표현하지 마세요. 계산기 source에 포함된 규정 조항은 원문 조회가 아니므로 직접 인용하지 마세요.`,
    };
  } catch {
    return null;
  }
}

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
  if (!intent.hasCalcIntent || !intent.calculatorId) return null;
  if (intent.canAutoExecute && resolveChatCalculationEvidence(query)) return null;

  const needed = [...intent.missingRequired, ...intent.missingOptional]
    .map((p) => `${p.description}${p.unit ? ` (${p.unit})` : ''}`)
    .slice(0, 8);
  const unread = intent.unreadNumbers.length > 0
    ? `\n질문에 있으나 앱이 어느 입력인지 읽지 못한 수치: ${intent.unreadNumbers.join(', ')} — 각각 무엇의 값인지 확인하세요.`
    : '';

  return `\n\n계산 요청이지만 검증된 ESA 계산기(${intent.calculatorName ?? intent.calculatorId})를 실행할 입력이 확정되지 않았습니다.\n직접 계산해서 수치를 제시하지 마세요. 대신 필요한 입력을 구체적으로 되물으세요.\n필요한 입력: ${needed.join(', ') || '없음'}${unread}\n일반 원리·공식·판단 기준은 수치 없이 설명해도 됩니다.`;
}
