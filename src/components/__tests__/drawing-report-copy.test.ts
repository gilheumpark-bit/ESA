import { explainDrawingHold } from '@/components/drawing-report-copy';

describe('drawing report HOLD copy', () => {
  it('turns internal traceability codes into field-review instructions', () => {
    expect(explainDrawingHold('HOLD_DRAWING_HASH_MISMATCH')).toEqual({
      title: '원본 도면 불일치',
      detail: '분석 근거와 현재 보고서의 도면 해시가 다릅니다. 같은 원본으로 다시 분석해야 합니다.',
    });
    expect(explainDrawingHold('HOLD_UNRESOLVED_RELATION').detail).toContain('기기와 선로');
  });

  it('preserves an unknown code as an auditable reference', () => {
    expect(explainDrawingHold('HOLD_NEW_GUARD')).toEqual({
      title: '추가 확인 필요',
      detail: '검증 보류 코드: HOLD_NEW_GUARD',
    });
  });
});
