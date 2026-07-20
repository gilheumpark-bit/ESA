import {
  labelCertainty,
  labelCountStatus,
  labelCrossPageStatus,
  labelDocumentReadStatus,
  labelJobStatus,
  labelLineKind,
  labelPageStatus,
  labelReadFailureCode,
  labelRecommendationStatus,
} from '@/components/drawing-v3-labels';

describe('drawing V3 user-facing labels', () => {
  it('translates workflow and evidence states without exposing internal enums', () => {
    expect(labelJobStatus('ANALYZING_PAGES')).toBe('페이지 분석 중');
    expect(labelDocumentReadStatus('PARTIAL')).toBe('일부 분석 완료');
    expect(labelPageStatus('skipped-empty')).toBe('빈 페이지');
    expect(labelCertainty('ambiguous')).toBe('확인 필요');
    expect(labelCountStatus('CONDITIONAL')).toBe('조건부 집계');
    expect(labelRecommendationStatus('SUPPORTED')).toBe('근거 확인');
    expect(labelCrossPageStatus('candidate')).toBe('연결 후보');
    expect(labelLineKind('ground')).toBe('접지선');
  });

  it('turns every read failure code into a concrete Korean review instruction', () => {
    expect(labelReadFailureCode('AMBIGUOUS_OCR')).toBe('문자 판독 후보 확인');
    expect(labelReadFailureCode('LINE_CONTINUITY_UNCERTAIN')).toBe('선로 연속성 확인');
    expect(labelReadFailureCode('PARTIAL_BUDGET_EXCEEDED')).toBe('분석 한도 도달');
  });

  it('uses a safe user-facing fallback for a future status', () => {
    expect(labelJobStatus('FUTURE_STATUS')).toBe('상태 확인 필요');
    expect(labelReadFailureCode('FUTURE_HOLD')).toBe('추가 확인 필요');
  });
});
