import { NextRequest } from 'next/server';

import { GET } from '../route';

/**
 * 공개 OpenAPI 선언이 **실제 라우트와 맞는가.**
 *
 * 이 문서를 보고 외부에서 붙는다. 틀리면 통합하는 쪽이 되는 길을 못 찾거나
 * 없는 길을 시도한다 — 이번 세션 내내 고쳐 온 "인용이 실제와 다른" 결함과
 * 같은 계열이다.
 *
 * 실측 2026-07-28 — `/export` 선언에서 셋이 어긋나 있었다:
 *  ① `required: ['receiptId','format']` — 라우트는 **`receipt` 객체도** 받는다
 *     (익명·클라이언트 보관 영수증). 문서만 보면 그 길이 없다.
 *  ② `lang` enum 이 `['ko','en']` — 실제 `ExportLang` 은 **ko/en/ja/zh** 이고
 *     넷 다 동작한다(인쇄 안내가 네 언어로 렌더되는 것을 실측).
 *  ③ 요약이 "PDF" — `pdf` 는 `text/html` 을 돌려준다(`%PDF-` 서명 없음).
 *
 * 맞았던 것도 있다: `/chat` 의 `required[messages,provider,model]` 은 정확했고
 * (model 누락 시 400), `/search` 는 POST `{query}` 가 맞다(GET 은 405).
 * 전부 틀렸다고 보고하지 않기 위해 여기 적어 둔다.
 */

async function spec(): Promise<Record<string, unknown>> {
  const res = await GET(new NextRequest('http://localhost/api/openapi'));
  return res.json();
}

describe('OpenAPI 선언 — 실제와 대조', () => {
  it('spec 이 실제로 나온다 — 이 검사가 공회전이 아님', async () => {
    const j = await spec() as { paths?: Record<string, unknown>; servers?: unknown[] };
    expect(Object.keys(j.paths ?? {}).length).toBeGreaterThanOrEqual(8);
    // 경로가 `/api` 없이 적히는 이유 — servers 가 그 베이스를 갖는다.
    // 이걸 모르고 대조하면 전부 "유령" 으로 보인다(내 첫 탐침이 그랬다).
    expect(JSON.stringify(j.servers)).toMatch(/\/api/);
  });

  describe('/export', () => {
    const get = async () => {
      const j = await spec() as {
        paths: Record<string, { post: { summary: string; requestBody: { content: Record<string, { schema: Record<string, unknown> }> } } }>;
      };
      const op = j.paths['/export'].post;
      return { op, schema: op.requestBody.content['application/json'].schema as Record<string, unknown> };
    };

    it('receipt 객체 경로가 선언돼 있다', async () => {
      const { schema } = await get();
      const props = schema.properties as Record<string, unknown>;
      expect(props.receipt).toBeDefined();
      // 둘 중 하나면 된다는 것을 표현한다.
      expect(JSON.stringify(schema.oneOf)).toMatch(/receiptId/);
      expect(JSON.stringify(schema.oneOf)).toMatch(/receipt"/);
    });

    it('lang 에 네 언어가 다 있다', async () => {
      const { schema } = await get();
      const props = schema.properties as Record<string, { enum?: string[] }>;
      expect(props.lang?.enum?.sort()).toEqual(['en', 'ja', 'ko', 'zh']);
    });

    /**
     * 요약과 format 설명을 **따로** 본다. 합쳐서 보면 한쪽을 되돌려도
     * 다른 쪽이 대신 만족시킨다 — 변이 실측에서 요약을 "PDF/Excel/CSV" 로
     * 되돌려도 초록이었다(2026-07-28). 이번 세션에 세 번째 같은 함정이다.
     */
    it('요약이 PDF 파일을 약속하지 않는다', async () => {
      const { op } = await get();
      expect(op.summary).toMatch(/인쇄용 HTML/);
      expect(op.summary).not.toMatch(/\(PDF\//);
    });

    it('format 설명이 pdf 의 실제 산출물을 밝힌다', async () => {
      const { schema } = await get();
      const props = schema.properties as Record<string, { description?: string }>;
      expect(props.format?.description ?? '').toMatch(/PDF 파일이 아니다|text\/html/);
    });
  });

  /** 맞게 적혀 있던 것들 — 되돌아가지 않도록 함께 잠근다. */
  describe('이미 정확한 선언', () => {
    it('/chat 은 messages·provider·model 을 요구한다', async () => {
      const j = await spec() as { paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { required?: string[] } }> } } }> };
      const req = j.paths['/chat'].post.requestBody.content['application/json'].schema.required ?? [];
      expect(req.sort()).toEqual(['messages', 'model', 'provider']);
    });

    it('/search 는 query 를 요구한다 — q 가 아니다', async () => {
      const j = await spec() as { paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { required?: string[]; properties?: Record<string, unknown> } }> } } }> };
      const sch = j.paths['/search'].post.requestBody.content['application/json'].schema;
      expect(sch.required).toContain('query');
      expect(Object.keys(sch.properties ?? {})).not.toContain('q');
    });
  });
});
