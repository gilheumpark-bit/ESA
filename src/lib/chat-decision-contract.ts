/**
 * 일반 AI 답변의 판단 책임 계약.
 *
 * 모델이 판단·수량·기기 종류를 사용자에게 되묻는 경우만 잡는다. 현행 원문 대조,
 * 무전압 확인처럼 사용자가 실제로 수행해야 하는 안전 행동은 이 계약의 대상이 아니다.
 */

export type DecisionContractViolationKind = 'delegated_judgment' | 'reverse_input_question';

export interface DecisionContractViolation {
  kind: DecisionContractViolationKind;
  text: string;
  index: number;
}

export interface DecisionContractInspection {
  passed: boolean;
  violations: DecisionContractViolation[];
}

export interface DecisionRepairPrompt {
  instructions: string;
  input: string;
}

const KO_DELEGATED_JUDGMENT = /(?:사용자(?:가|께서)?|직접)[^.!?\n]{0,32}(?:판단|결정|선택|확정|세어|세는)(?:해|하|해야|해\s*주|하셔|할)[^.!?\n]*/gi;
const KO_REVERSE_INPUT = /(?:값|수량|몇\s*개|정격|계통\s*전압|전압|전류|길이|종류|연결\s*대상)[^.!?\n]{0,32}(?:알려\s*주|입력해\s*주|답해\s*주)(?:시면|세요)[^.!?\n]{0,24}(?:판단|결정|계산|분석|답변)?[^.!?\n]*/gi;
const KO_REVERSE_QUESTION = /(?:계통\s*전압|전압|전류|길이|정격|수량|종류|연결\s*대상)(?:은|는|이|가|을|를)?\s*(?:얼마|무엇|어느\s*것)[^.!?\n]{0,20}(?:입니까|인가요|일까요)\??/gi;
const KO_COUNT_QUESTION = /몇\s*(?:개|건|대|기|가닥|회로)(?:로)?\s*(?:(?:보이|판독되|확인되|추정되|판단되)\s*)?(?:나요|인가요|일까요|입니까|습니까)\??/gi;

const EN_DELEGATED_JUDGMENT = /\byou\s+(?:need|have|must|should)\s+to\s+(?:decide|determine|choose|count|confirm)\b[^.!?\n]*/gi;
const EN_REVERSE_INPUT = /\b(?:tell|give|provide)\s+me\b[^.!?\n]{0,48}\b(?:and|then)\s+I(?:'ll|\s+will)\s+(?:decide|determine|calculate|analy[sz]e|answer)\b[^.!?\n]*/gi;

const QUOTED_SEGMENTS = [
  /“[^”]*”/g,
  /‘[^’]*’/g,
  /"(?:\\.|[^"\\])*"/g,
  /'(?:\\.|[^'\\])*'/g,
  /`[^`]*`/g,
] as const;

function maskQuotedSegments(text: string): string {
  return QUOTED_SEGMENTS.reduce(
    (masked, pattern) => masked.replace(pattern, (match) => ' '.repeat(match.length)),
    text,
  );
}

function collect(
  source: string,
  pattern: RegExp,
  kind: DecisionContractViolationKind,
): DecisionContractViolation[] {
  const matches: DecisionContractViolation[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const text = match[0].trim();
    if (text) matches.push({ kind, text, index: match.index });
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return matches;
}

export function inspectDecisionContract(
  text: string,
  language: 'ko' | 'en',
): DecisionContractInspection {
  const source = maskQuotedSegments(text);
  const violations = language === 'en'
    ? [
        ...collect(source, EN_DELEGATED_JUDGMENT, 'delegated_judgment'),
        ...collect(source, EN_REVERSE_INPUT, 'reverse_input_question'),
      ]
    : [
        ...collect(source, KO_DELEGATED_JUDGMENT, 'delegated_judgment'),
        ...collect(source, KO_REVERSE_INPUT, 'reverse_input_question'),
        ...collect(source, KO_REVERSE_QUESTION, 'reverse_input_question'),
        ...collect(source, KO_COUNT_QUESTION, 'reverse_input_question'),
      ];

  const unique = [...new Map(
    violations
      .sort((left, right) => left.index - right.index)
      .map((violation) => [`${violation.kind}:${violation.index}:${violation.text}`, violation]),
  ).values()];
  return { passed: unique.length === 0, violations: unique };
}

function encodeUntrusted(value: string): string {
  return JSON.stringify(value)
    .slice(1, -1)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

export function buildDecisionRepairPrompt(
  query: string,
  answer: string,
  language: 'ko' | 'en',
): DecisionRepairPrompt {
  if (language === 'en') {
    return {
      instructions: [
        'Rewrite the supplied answer without delegating technical judgment to the user.',
        'Lead with "ESA provisional judgment", then give the supporting basis and a declarative "Conclusion-changing conditions" list.',
        'Do not ask the user a question. Do not invent new facts, numbers, standard clauses, or source tags.',
        'If the evidence cannot support a judgment, explicitly withhold only that decision and continue the remaining analysis.',
        'Return only the repaired answer.',
      ].join('\n'),
      input: `<untrusted_query>\n${encodeUntrusted(query)}\n</untrusted_query>\n<untrusted_answer>\n${encodeUntrusted(answer)}\n</untrusted_answer>`,
    };
  }

  return {
    instructions: [
      '아래 답변을 사용자가 기술 판단을 대신하지 않도록 다시 작성하세요.',
      '먼저 "ESA 잠정 판단"을 쓰고, 그 근거와 선언형 "결론 변경 조건"을 이어서 제시하세요.',
      '사용자에게 질문형으로 되묻지 마세요. 새 사실·새 수치·새 표준 조항·새 출처 태그를 만들지 마세요.',
      '근거가 부족하면 그 판단축만 보류한다고 명시하고 나머지 분석은 계속하세요.',
      '수리된 답변만 출력하세요.',
    ].join('\n'),
    input: `<untrusted_query>\n${encodeUntrusted(query)}\n</untrusted_query>\n<untrusted_answer>\n${encodeUntrusted(answer)}\n</untrusted_answer>`,
  };
}

export function buildDecisionContractFallback(language: 'ko' | 'en'): string {
  if (language === 'en') {
    return 'ESA judgment: Decision incomplete. The available response does not support a defensible provisional conclusion. ESA is withholding only this decision while preserving the remaining analysis. Conclusion-changing conditions: source evidence that resolves the disputed item.';
  }
  return 'ESA 판단: 판단 미완결입니다. 현재 응답만으로 방어 가능한 잠정 결론을 만들 수 없어 해당 판단만 보류하고 나머지 분석은 유지합니다. 결론 변경 조건: 문제 항목을 확정할 수 있는 원본 근거.';
}

// IDENTITY_SEAL: lib/chat-decision-contract | role=일반 AI 판단 책임 검사·1회 교정 프롬프트·실패 폐쇄 문구 | inputs=질문·모델 답변·언어 | outputs=위반 목록·교정 입력·폴백
