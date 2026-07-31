/**
 * 보류·소견의 근거를 사람이 읽는 문장으로.
 *
 * 제안 계층은 확정할 수 없는 것을 HOLD 로 남긴다. 그런데 사용자가 받는 것이
 * 「보류 · 규칙 1건」 같은 **개수** 뿐이면, 그건 근거를 인용한 거절이 아니라
 * 그냥 못 하겠다는 말로 읽힌다. 실무자는 수긍할 수 없다.
 *
 * 거절이 받아들여지려면 셋이 같이 나가야 한다.
 *   1. 무엇을 근거로 판단했는가 — 규칙의 이름과 취지
 *   2. 왜 확정하지 못하는가   — 규칙이 요구하는 조건
 *   3. 무엇을 채우면 판정되는가 — `recommendation.requiredInputs`
 *
 * 이 모듈은 1·2 를 제공한다. 3 은 제안 자체가 이미 들고 있다.
 */

import { citationOrigin } from '@engine/standards/citation-registry';
import { isRealKecClause } from '@engine/standards/kec/clause-index';

/** 내부 그래프 규칙 식별자 접두사 — 기준서 조항인 척하지 않는다. */
export const INTERNAL_RULE_PREFIX = 'ESA-SLD-RULE:';

export interface RuleBasis {
  /** 화면에 그대로 쓰는 규칙 이름 */
  label: string;
  /** 이 규칙이 왜 존재하며 무엇을 요구하는지 — 거절의 근거 문장 */
  basis: string;
  /** 기준서 조항인 경우의 원문 확보 경로 */
  originUrl?: string;
  /** 기준서 조항이 아니라 ESA 자체 판독 규칙인지 */
  internal: boolean;
}

/**
 * ESA 자체 그래프 규칙의 근거.
 *
 * 이것들은 기준서 조항이 아니다. 도면 판독 결과가 확정적인지 판단하는 ESA 의
 * 내부 규칙이며, 그 사실을 숨기지 않는다. 기준서 조항인 척하는 것보다
 * 「우리 판독 규칙상 이래서 확정하지 못한다」가 정직하고, 실무자에게도
 * 반박·확인 가능한 형태다.
 */
const INTERNAL_RULES: Readonly<Record<string, { label: string; basis: string }>> = {
  'ORPHAN-CONNECTION': {
    label: '고아 장치 검출 규칙',
    basis:
      '확정된 결선 어디에도 연결되지 않은 기기입니다. 결선 표기 누락, 구획 경계에서의 '
      + '선 잘림, 다른 페이지 참조 중 하나일 수 있습니다. 세 경우의 처리가 서로 다르므로 '
      + '원인을 가리기 전에는 결함으로 확정하지 않습니다.',
  },
};

/**
 * `KEC 232.3.9 수용가 설비에서의 전압강하` 처럼 «기관 · 조항번호 · (제목)» 형태를 가른다.
 * 제목은 선택이다 — 이 저장소는 붙이는 곳과 안 붙이는 곳이 둘 다 있다.
 */
const CLAUSE_REF = /^([A-Z][A-Za-z]*)\s+(\d+(?:\.\d+)*(?:\([^)]*\))?)(?:\s+(.*))?$/;

/**
 * 제안의 `standardRefs` 항목 하나를 사람이 읽는 근거로 바꾼다.
 *
 * 해석되지 않으면 `undefined` 를 돌려준다 — **알 수 없는 문자열을 그럴듯한
 * 근거 문장으로 포장하지 않는다.** 근거 없는 확정 소견을 막는 게 이 계층의
 * 존재 이유인데, 여기서 포장해 버리면 그 방어가 무의미해진다.
 */
export function describeStandardRef(ref: string): RuleBasis | undefined {
  if (ref.startsWith(INTERNAL_RULE_PREFIX)) {
    const rule = INTERNAL_RULES[ref.slice(INTERNAL_RULE_PREFIX.length)];
    return rule ? { ...rule, internal: true } : undefined;
  }

  const parsed = CLAUSE_REF.exec(ref.trim());
  if (!parsed) return undefined;
  const [, standard, clause, title] = parsed;

  const origin = citationOrigin(standard);
  if (!origin) return undefined;

  // KEC 는 공표 전문 색인이라는 오라클이 있다. 없는 번호는 근거로 내보내지 않는다.
  if (standard === 'KEC' && !isRealKecClause(clause)) return undefined;

  return {
    label: title ? `${standard} ${clause} ${title}` : `${standard} ${clause}`,
    basis:
      `${origin.publisher} 발행 기준입니다. 이 저장소는 기준서 원문 문장을 담지 않으므로`
      + `${origin.access === 'paid' ? '(유료 표준)' : ''} 조항 원문에서 직접 확인하십시오.`,
    originUrl: origin.url,
    internal: false,
  };
}

/** 제안 하나에 붙은 근거들을 순서대로 해석한다. 해석 불가 항목은 버린다. */
export function describeStandardRefs(refs: readonly string[]): RuleBasis[] {
  return refs.map(describeStandardRef).filter((item): item is RuleBasis => item !== undefined);
}
