import { KEC_ARTICLES, evaluateKEC } from '../kec';
import type { CodeArticle } from '../kec/types';
import { makeBlock } from '../kec/types';

/**
 * **근거 없는 PASS 를 차단한다.**
 *
 * 범용 조건 트리 평가기는 `article.conditions` 를 순회하며 판정한다. conditions
 * 가 비어 있으면 루프가 한 번도 돌지 않아 `hasFail=false` 로 남고,
 * matchedConditions 도 notes 도 전부 빈 채 PASS 가 나간다 — **어떤 입력에도 적합.**
 *
 * 이것이 Verdict 에 BLOCK 이 정의된 이유인데, `makeBlock` 헬퍼는 만들어져
 * 있을 뿐 **호출처가 0** 이었다(§2.2 wired 착시 — 존재하지만 발화하지 않는 방어).
 * 자리표시자 임계값(value:0)은 evaluator-guard 가 이미 HOLD 로 막고 있었지만,
 * 조건 자체가 없는 경우는 뚫려 있었다.
 */

function articleWithoutConditions(): CodeArticle {
  return {
    id: 'KEC-TEST-EMPTY',
    country: 'KR',
    standard: 'KEC',
    article: '999.9',
    title: '조건이 없는 시험용 조항',
    conditions: [],
    effectiveDate: '2021-01-01',
    version: '2021',
  };
}

describe('조건이 없는 조항은 PASS 가 아니라 BLOCK 이다', () => {
  test('makeBlock 은 근거 없는 판정을 BLOCK 으로 표시한다', () => {
    const result = makeBlock(articleWithoutConditions(), '조건 없음');
    expect(result.judgment).toBe('BLOCK');
    expect(result.matchedConditions).toEqual([]);
    expect(result.failedConditions).toEqual([]);
    expect(result.notes.join(' ')).toContain('조건 없음');
  });

  test('조건 없는 조항을 평가하면 어떤 입력에도 PASS 가 나오지 않는다', () => {
    const article = articleWithoutConditions();
    KEC_ARTICLES.set(article.id, article);
    try {
      const inputs: Record<string, number>[] = [{}, { voltageDropPercent: 0 }, { voltageDropPercent: 99 }];
      for (const params of inputs) {
        const result = evaluateKEC(article.id, params);
        expect(result.judgment).toBe('BLOCK');
      }
    } finally {
      KEC_ARTICLES.delete(article.id);
    }
  });

  /**
   * 차단이 정상 경로까지 삼키면 그건 수리가 아니라 새 결함이다(§2.11).
   * 조항 번호는 KEC 232.3.9 「수용가 설비에서의 전압강하」 — 실재하는 조문이다.
   */
  test('조건을 가진 실제 조항은 그대로 판정된다 — BLOCK 이 정상 경로를 막지 않는다', () => {
    expect(evaluateKEC('KEC-232.3.9-MAIN', { voltageDropPercent: 2 }).judgment).toBe('PASS');
    expect(evaluateKEC('KEC-232.3.9-MAIN', { voltageDropPercent: 7 }).judgment).toBe('FAIL');
  });
});
