import { IEC_ARTICLES, getIECArticleCount, getIECArticle } from '../iec-articles';

describe('IEC 60364 Articles', () => {
  test('has 25+ articles registered', () => {
    expect(getIECArticleCount()).toBeGreaterThanOrEqual(25);
  });

  test('all articles have required fields', () => {
    for (const [id, article] of IEC_ARTICLES) {
      expect(article.id).toBe(id);
      expect(article.country).toBe('INT');
      expect(article.standard).toBe('IEC 60364');
      expect(article.conditions.length).toBeGreaterThan(0);
    }
  });

  test('IEC-411.1 touch voltage ≤50V', () => {
    const article = getIECArticle('IEC-411.1');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].value).toBe(50);
    expect(article!.conditions[0].unit).toBe('V');
  });

  test('IEC-411.3.2 disconnection ≤0.4s for TN', () => {
    const article = getIECArticle('IEC-411.3.2');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].value).toBe(0.4);
    expect(article!.conditions[0].unit).toBe('s');
  });

  test('IEC-525.1 voltage drop ≤4%', () => {
    const article = getIECArticle('IEC-525.1');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].value).toBe(4);
  });

  test('IEC-612.3 insulation resistance ≥1MΩ', () => {
    const article = getIECArticle('IEC-612.3');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].value).toBe(1);
    expect(article!.conditions[0].operator).toBe('>=');
  });

  test('cross-references to KEC/NEC exist', () => {
    const article = getIECArticle('IEC-411.1');
    const refs = article!.relatedClauses!;
    expect(refs.some(r => r.articleId.startsWith('KEC'))).toBe(true);
    expect(refs.some(r => r.articleId.startsWith('NEC'))).toBe(true);
  });

  test('returns null for non-existent', () => {
    expect(getIECArticle('IEC-999.99')).toBeNull();
  });
});
