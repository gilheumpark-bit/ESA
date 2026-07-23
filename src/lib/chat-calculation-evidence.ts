import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import type { DetailedCalcResult } from '@/engine/calculators';
import { analyzeCalcIntent } from '@/lib/calc-intent-bridge';

export interface ChatCalculationEvidence {
  calculatorId: string;
  calculatorName: string;
  input: Record<string, unknown>;
  result: Pick<DetailedCalcResult, 'value' | 'unit' | 'formula' | 'steps' | 'additionalOutputs' | 'judgment'>;
  trustedText: string;
  promptContext: string;
}

function coerceInput(
  definitions: ReturnType<typeof analyzeCalcIntent>['allParams'],
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const definition of definitions) {
    const raw = definition.name in extracted ? extracted[definition.name] : definition.defaultValue;
    if (raw === undefined) continue;
    if (definition.type === 'number') {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) throw new Error(`CHAT_CALC_INVALID_NUMBER:${definition.name}`);
      input[definition.name] = value;
    } else if (definition.type === 'boolean') {
      input[definition.name] = Boolean(raw);
    } else {
      input[definition.name] = raw;
    }
  }
  return input;
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
    const input = coerceInput(intent.allParams, intent.extractedParams);
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
