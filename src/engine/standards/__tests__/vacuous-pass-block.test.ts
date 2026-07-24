import { KEC_ARTICLES, evaluateKEC } from '../kec';
import type { CodeArticle } from '../kec/types';
import { makeBlock } from '../kec/types';

// ============================================================
// 근거 없는 PASS 차단 (BLOCK)
// ============================================================
// 범용 조건 트리 평가기는 article.conditions를 순회하며 판정한다.
// conditions가 비어 있으면 루프가 한 번도 돌지 않아 hasFail=false로 남고,
// matchedConditions·notes가 전부 빈 채 PASS가 나간다 — 어떤 입력에도 적합.
//
// 이것이 Verdict에 BLOCK이 정의된 이유인데, makeBlock 헬퍼는 만들어져 있을 뿐
// 호출처가 0이었다. 자리표시자 임계값(value:0)은 evaluator-guard가 이미
// HOLD로 막고 있었지만, 조건 자체가 없는 경우는 뚫려 있었다.
// ============================================================

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

describe('조건이 없는 조항은 PASS가 아니라 BLOCK이다', () => {
  test('makeBlock은 근거 없는 판정을 BLOCK으로 표시한다', () => {
    const result = makeBlock(articleWithoutConditions(), '조건 없음');
    expect(result.judgment).toBe('BLOCK');
    expect(result.matchedConditions).toEqual([]);
    expect(result.failedConditions).toEqual([]);
    expect(result.notes.join(' ')).toContain('조건 없음');
  });

  test('조건 없는 조항을 평가하면 어떤 입력에도 PASS가 나오지 않는다', () => {
    const article = articleWithoutConditions();
    // 배열 리터럴을 그대로 두면 빈 객체가 `{ voltageDropPercent?: undefined }`로
    // 추론돼 Record<string, number>에 맞지 않는다. 명시적으로 고정한다.
    const cases: Array<Record<string, number>> = [
      {},
      { voltageDropPercent: 0 },
      { voltageDropPercent: 99 },
    ];
    KEC_ARTICLES.set(article.id, article);
    try {
      for (const params of cases) {
        const result = evaluateKEC(article.id, params);
        expect(result.judgment).toBe('BLOCK');
        expect(result.judgment).not.toBe('PASS');
      }
    } finally {
      KEC_ARTICLES.delete(article.id);
    }
  });

  test('조건을 가진 실제 조항은 그대로 판정된다 — BLOCK이 정상 경로를 막지 않는다', () => {
    // 전압강하 간선 3% 기준: 2%는 적합, 7%는 부적합.
    expect(evaluateKEC('KEC-232.52-MAIN', { voltageDropPercent: 2 }).judgment).toBe('PASS');
    expect(evaluateKEC('KEC-232.52-MAIN', { voltageDropPercent: 7 }).judgment).toBe('FAIL');
  });
});
