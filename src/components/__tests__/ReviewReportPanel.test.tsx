/**
 * ReviewReportPanel — 검토 판정 + 무발명 시정 제안이 화면 문자열로 실제 렌더되는지.
 * react-dom/server 정적 렌더로 검증(브라우저 업로드·RTL 불요). 시너지 회귀 가드:
 * 제안(action+출처)이 UI에서 사라지면 이 테스트가 즉시 잡는다.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReviewReport } from '@/engine/review/circuit-review';
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

/**
 * **검토 범위 — 안 본 것을 말하는가.**
 *
 * 엔진은 `coverage`(차단기 총수·정격 읽은 수·케이블 결속 수)를 세어 보내는데
 * 패널이 통째로 버렸다(호출처 0, 2026-07-29 실측). 그래서 차단기 12 개 중
 * 3 개만 읽힌 도면도 판정 배지만 보였고, `FAIL 0` 이 **"이상 없음"** 으로
 * 읽혔다 — 실제로는 9 개를 아예 안 본 것이다.
 *
 * 이 제품의 쓸모가 "빠진 게 있는지 찾아 준다" 라면, 리포트가 자기가 안 본
 * 곳을 말하지 않는 것이 가장 큰 빠짐이다.
 */
describe('검토 범위 표기', () => {
  const withCoverage = (
    coverage: ReviewReport['coverage'],
    findings: ReviewReport['findings'] = [],
  ): ReviewLike => ({
    findings,
    summary: { pass: 0, warn: 0, fail: 0, unknown: 0, info: 0 },
    coverage,
    disclaimer: '검토 보조 결과입니다.',
  });

  it('총수·읽은 수·결속 수를 그대로 보여 준다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 12, breakersRatedParsed: 7, breakersWithCable: 4 })} />,
    );
    expect(html).toContain('검토 범위');
    expect(html).toContain('차단기 12');
    expect(html).toContain('정격 읽음 7');
    expect(html).toContain('케이블 결속 4');
  });

  it('못 읽은 차단기가 있으면 개수와 함께 경고한다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 12, breakersRatedParsed: 3, breakersWithCable: 3 })} />,
    );
    expect(html).toContain('9개는 정격을 못 읽어');
    expect(html).toContain('판정 개수에 들어 있지 않습니다');
  });

  it('케이블이 결속 안 된 만큼 허용전류 대조를 못 했다고 말한다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 5, breakersRatedParsed: 5, breakersWithCable: 2 })} />,
    );
    expect(html).toContain('3개는 허용전류 대조를 못 했습니다');
  });

  /** 하나도 못 읽었으면 "판정" 이라는 말 자체가 오해다. */
  it('정격을 하나도 못 읽으면 회로 검토가 아니라고 말한다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 8, breakersRatedParsed: 0, breakersWithCable: 0 })} />,
    );
    expect(html).toContain('정격을 하나도 읽지 못했습니다');
    expect(html).toContain('회로 검토가 아닙니다');
  });

  /** 다 읽었으면 조용해야 한다 — 늑대 소년이 되면 아무도 안 읽는다. */
  it('전부 읽혔으면 경고를 붙이지 않는다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 6, breakersRatedParsed: 6, breakersWithCable: 6 })} />,
    );
    expect(html).toContain('차단기 6');
    expect(html).not.toContain('못 읽어');
    expect(html).not.toContain('대조를 못 했습니다');
  });

  /**
   * 빈 결과가 "적합" 으로 읽히지 않아야 한다. 앞서는 `판정 항목이 없습니다`
   * 한 줄이라 깨끗한 도면과 못 읽은 도면이 같은 화면이었다.
   */
  it('판정 항목이 0 이어도 적합이라고 말하지 않는다', () => {
    const html = renderToStaticMarkup(
      <ReviewReportPanel review={withCoverage({ breakersTotal: 4, breakersRatedParsed: 0, breakersWithCable: 0 })} />,
    );
    expect(html).toContain('대조가 성립하지 않았다');
    expect(html).not.toContain('이상 없');
  });
});

/**
 * **판독 범위 줄은 읽혀야 한다 — 대비 회귀 가드.**
 *
 * 라이브 실측(2026-07-29, dev 서버 · 계산된 색으로 WCAG 비율 산출):
 * `--text-tertiary` 는 이 패널 배경 대비 **라이트 3.53 · 다크 4.96** 이다.
 * 12~13px 본문의 AA 기준은 4.5 이므로 라이트에서 미달이었다. `--text-secondary`
 * 로 올린 뒤 **라이트 6.61 · 다크 8.72** 를 실측했다.
 *
 * jsdom 은 CSS 변수를 계산하지 않아 여기서 비율을 다시 잴 수는 없다. 그래서
 * 이 검사는 **선택을 잠근다** — 누가 tertiary 로 되돌리면 깨진다. 실제 비율은
 * 위 실측이 근거다(이 검사가 대비를 증명하지는 않는다).
 */
describe('판독 범위 줄 대비', () => {
  const html = renderToStaticMarkup(
    <ReviewReportPanel
      review={{
        findings: [],
        summary: { pass: 0, warn: 0, fail: 0, unknown: 0, info: 0 },
        coverage: { breakersTotal: 2, breakersRatedParsed: 1, breakersWithCable: 1 },
        disclaimer: '검토 보조 결과입니다.',
        topology: { nodes: 3, edges: 2, isolated: 0, fragments: 1 },
      }}
    />,
  );

  it.each(['coverage-readout', 'topology-readout'])('%s 는 tertiary 를 쓰지 않는다', (id) => {
    const line = html.split('<p ').find((chunk) => chunk.includes(`data-testid="${id}"`));
    expect(line).toBeDefined();
    expect(line!.slice(0, line!.indexOf('>'))).toContain('--text-secondary');
    expect(line!.slice(0, line!.indexOf('>'))).not.toContain('--text-tertiary');
  });
});
