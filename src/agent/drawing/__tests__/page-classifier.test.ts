import { surveyPageKind } from '../page-classifier';

describe('surveyPageKind', () => {
  it('does not call a PDF page empty when one constructPath contains drawing geometry', () => {
    expect(surveyPageKind({
      textSample: '',
      vectorOpCount: 1,
      rasterCoverage: 0,
    })).not.toBe('empty');
  });
});
