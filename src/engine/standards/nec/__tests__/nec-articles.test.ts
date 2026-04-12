import { NEC_ARTICLES_FULL, getNECArticleCount, getNECArticleFull } from '../nec-articles';

describe('NEC 2023 Articles', () => {
  test('has 40+ articles registered', () => {
    expect(getNECArticleCount()).toBeGreaterThanOrEqual(40);
  });

  test('all articles have required fields', () => {
    for (const [id, article] of NEC_ARTICLES_FULL) {
      expect(article.id).toBe(id);
      expect(article.country).toBe('US');
      expect(article.standard).toBe('NEC');
      expect(article.article).toBeTruthy();
      expect(article.title).toBeTruthy();
      expect(article.conditions.length).toBeGreaterThan(0);
      expect(article.effectiveDate).toBe('2023-01-01');
      expect(article.version).toBe('2023');
    }
  });

  test('lookup by ID: NEC-310.16', () => {
    const article = getNECArticleFull('NEC-310.16');
    expect(article).not.toBeNull();
    expect(article!.title).toContain('허용전류');
  });

  test('lookup by clause: 430.52', () => {
    const article = getNECArticleFull('430.52');
    expect(article).not.toBeNull();
    expect(article!.title).toContain('전동기 분기');
  });

  test('NEC-240.6 has standard ampere ratings', () => {
    const article = getNECArticleFull('NEC-240.6');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].note).toContain('15,20,25,30') || expect(article!.conditions[0].note).toContain('표준 정격');
  });

  test('NEC-250.122 has EGC sizing', () => {
    const article = getNECArticleFull('NEC-250.122');
    expect(article).not.toBeNull();
    expect(article!.conditions[0].note).toContain('15A→14AWG');
  });

  test('cross-references to KEC exist', () => {
    const article = getNECArticleFull('NEC-310.16');
    expect(article!.relatedClauses).toBeDefined();
    const kecRef = article!.relatedClauses!.find(r => r.articleId.startsWith('KEC'));
    expect(kecRef).toBeDefined();
    expect(kecRef!.relation).toBe('equivalent');
  });

  test('voltage drop articles present', () => {
    expect(getNECArticleFull('NEC-VD-BRANCH')).not.toBeNull();
    expect(getNECArticleFull('NEC-VD-FEEDER')).not.toBeNull();
  });

  test('returns null for non-existent article', () => {
    expect(getNECArticleFull('NEC-999.99')).toBeNull();
    expect(getNECArticleFull('INVALID')).toBeNull();
  });
});
