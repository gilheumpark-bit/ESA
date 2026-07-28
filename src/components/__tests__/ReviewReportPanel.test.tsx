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

  /**
   * 계통 판독 — 서버가 세어 응답에 실어 보내던 값인데 화면이 통째로 버리고
   * 있었다(2026-07-28 실측: src 전체에 소비처 0). 부품 목록만 보이면 계통까지
   * 읽힌 것으로 읽는다 — 스캔 경로의 실패 모드가 그거다.
   */
  describe('계통 판독', () => {
    const withTopology = (t: NonNullable<Extract<ReviewLike, { findings: unknown }>['topology']>): ReviewLike =>
      ({ ...failReview, topology: t });

    it('읽은 수치를 그대로 보여준다', () => {
      const html = renderToStaticMarkup(
        <ReviewReportPanel review={withTopology({ nodes: 20, edges: 14, isolated: 3, fragments: 2 })} />,
      );
      expect(html).toContain('부품 20');
      expect(html).toContain('연결 14');
      expect(html).toContain('고립 3');
      expect(html).toContain('분리 2');
    });

    it('연결 0 이면 목록으로만 쓰라고 말한다 — 숫자만 두지 않는다', () => {
      const html = renderToStaticMarkup(
        <ReviewReportPanel review={withTopology({ nodes: 35, edges: 0, isolated: 35, fragments: 35 })} />,
      );
      expect(html).toContain('data-unreadable="true"');
      expect(html).toContain('연결을 하나도 읽지 못했습니다');
      expect(html).toContain('계통 판단은 원본에서');
    });

    it('연결이 잡히면 경고를 붙이지 않는다 — 정상 판독을 겁주지 않는다', () => {
      const html = renderToStaticMarkup(
        <ReviewReportPanel review={withTopology({ nodes: 20, edges: 16, isolated: 0, fragments: 1 })} />,
      );
      expect(html).toContain('data-unreadable="false"');
      expect(html).not.toContain('하나도 읽지 못했습니다');
    });

    it('부품이 하나뿐이면 연결 0 이어도 경고하지 않는다', () => {
      const html = renderToStaticMarkup(
        <ReviewReportPanel review={withTopology({ nodes: 1, edges: 0, isolated: 0, fragments: 1 })} />,
      );
      expect(html).toContain('data-unreadable="false"');
    });

    it('없는 부품을 가리키는 연결은 있을 때만 적는다', () => {
      const base = { nodes: 20, edges: 14, isolated: 3, fragments: 2 };
      expect(renderToStaticMarkup(<ReviewReportPanel review={withTopology(base)} />))
        .not.toContain('없는 부품 참조');
      expect(renderToStaticMarkup(<ReviewReportPanel review={withTopology({ ...base, danglingEdges: 2 })} />))
        .toContain('없는 부품 참조 2');
    });

    /** 검토를 건너뛴 때야말로 판독 상태가 필요하다 — 사유만 있으면 왜인지 모른다. */
    it('검토 생략 갈래에도 판독 수치가 붙는다', () => {
      const html = renderToStaticMarkup(
        <ReviewReportPanel review={{
          skipped: true,
          reason: 'confidence 0.3 — 구조 판독 미달로 검토 생략',
          topology: { nodes: 9, edges: 0, isolated: 9, fragments: 9 },
        }} />,
      );
      expect(html).toContain('구조 판독 미달');
      expect(html).toContain('부품 9');
      expect(html).toContain('연결을 하나도 읽지 못했습니다');
    });

    it('판독 수치가 없으면 줄을 만들지 않는다 — 빈 칸을 그리지 않는다', () => {
      expect(renderToStaticMarkup(<ReviewReportPanel review={failReview} />))
        .not.toContain('계통 판독');
    });
  });
});
