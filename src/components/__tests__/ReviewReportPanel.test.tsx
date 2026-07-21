/**
 * ReviewReportPanel — 검토 판정 + 무발명 시정 제안이 화면 문자열로 실제 렌더되는지.
 * react-dom/server 정적 렌더로 검증(브라우저 업로드·RTL 불요). 시너지 회귀 가드:
 * 제안(action+출처)이 UI에서 사라지면 이 테스트가 즉시 잡는다.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import ReviewReportPanel, { type ReviewLike } from '../ReviewReportPanel';

const failReview: ReviewLike = {
  findings: [
    {
      rule: 'AT-LE-AF',
      severity: 'FAIL',
      subject: 'MCCB [N23]',
      given: { rating: '100AF/150AT' },
      verdict: '트립 150AT가 프레임 100AF를 초과 — 표기 오류 또는 선정 오류',
      proposal: [
        { action: '트립을 100AT 이하로 (프레임 100AF 유지)', basis: 'IEC 60947-1 표준 트립 정격(선호수)' },
        { action: '프레임을 160AF 이상으로 (트립 150AT 유지)', basis: 'IEC 60947-2 표준 프레임 정격' },
      ],
    },
  ],
  summary: { pass: 0, warn: 0, fail: 1, unknown: 0, info: 0 },
  coverage: { breakersTotal: 1, breakersRatedParsed: 1, breakersWithCable: 0 },
  disclaimer: '검토 보조 결과입니다 — 최종 판정·지시는 유자격 기술자의 몫입니다.',
};

describe('ReviewReportPanel', () => {
  it('부적합 판정 + 무발명 시정 제안(표준 역산값 + 출처)을 렌더한다', () => {
    const html = renderToStaticMarkup(<ReviewReportPanel review={failReview} />);
    expect(html).toContain('회로 검토');
    expect(html).toContain('부적합');
    expect(html).toContain('시정 제안');
    expect(html).toContain('160AF'); // 표준 역산 제안값(발명 아님)
    expect(html).toContain('IEC 60947-2 표준 프레임 정격'); // 출처(basis) 결박
    expect(html).toContain('프레임 100AF를 초과'); // verdict 근거
  });

  it('제안 없는 finding에는 시정 제안 블록이 없다', () => {
    const noProp: ReviewLike = {
      ...failReview,
      findings: [{ ...failReview.findings[0], proposal: undefined }],
    };
    const html = renderToStaticMarkup(<ReviewReportPanel review={noProp} />);
    expect(html).toContain('부적합');
    expect(html).not.toContain('시정 제안');
  });

  it('skipped 리뷰는 사유만 렌더한다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={{ skipped: true, reason: 'confidence 0.3 — 구조 판독 미달로 검토 생략' }} />,
    );
    expect(html).toContain('회로 검토');
    expect(html).toContain('구조 판독 미달');
    expect(html).not.toContain('시정 제안');
  });

  it('null 리뷰는 아무것도 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(<ReviewReportPanel review={null} />)).toBe('');
  });
});
