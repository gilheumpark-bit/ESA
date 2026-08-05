import { parsePdfToSLD } from '../pdf-vector-parser';

/**
 * pdf.js 는 받은 ArrayBuffer 를 워커로 transfer 해 detach 시킨다. 실제 라이브러리를
 * 부르지 않고 그 동작만 흉내 낸다 — 여기서 검증하려는 것은 파서가 **호출자의
 * 버퍼를 소유한 사본으로 바꿔 넘기는가** 이지 pdf.js 의 동작이 아니다.
 *
 * 실측 근거(KIMM 83p 설계세트, 2026-08-05): 같은 버퍼로 두 번 파싱하면
 * 1회차 기기 236 → 2회차 0 이 나왔고 warnings 는 비어 있었다. "이 장에는 기기가
 * 없다"와 구분되지 않는 조용한 실패다.
 */
const transferred: number[] = [];

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  OPS: { constructPath: 91 },
  getDocument: jest.fn((params: { data: Uint8Array }) => {
    // pdf.js 가 하는 일: 넘겨받은 바이트의 버퍼를 워커로 transfer 해 **detach** 한다.
    // 모의가 이걸 안 하면 시험이 수리 없이도 통과한다(실제로 그랬다) — 뷰를
    // 넘기든 사본을 넘기든 아무 차이가 안 생기기 때문이다.
    const length = params.data.byteLength;
    transferred.push(length);
    if (length > 0) {
      const owned = params.data.buffer as ArrayBuffer;
      structuredClone(owned, { transfer: [owned] });
    }
    if (length === 0) {
      // detach 된 입력을 받으면 아무것도 못 읽는다 — 실제 관측된 결과.
      return {
        destroy: async () => undefined,
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: () => ({ width: 100, height: 100 }),
            getTextContent: async () => ({ items: [] }),
            getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
            cleanup: () => undefined,
          }),
          destroy: async () => undefined,
        }),
      };
    }
    return {
      destroy: async () => undefined,
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 100 }),
          getTextContent: async () => ({
            items: [{ str: 'MOLD TR-1', transform: [1, 0, 0, 1, 10, 10] }],
          }),
          getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
          cleanup: () => undefined,
        }),
        destroy: async () => undefined,
      }),
    };
  }),
}));

describe('parsePdfToSLD 버퍼 소유권', () => {
  beforeEach(() => { transferred.length = 0; });

  it('같은 버퍼로 두 번 파싱해도 같은 결과가 나온다', async () => {
    const source = new Uint8Array([37, 80, 68, 70, 1, 2, 3, 4]).buffer;

    const first = await parsePdfToSLD(source, { pageNumber: 1 });
    const second = await parsePdfToSLD(source, { pageNumber: 1 });

    expect(first.components.length).toBeGreaterThan(0);
    // 회귀 지점: 종전에는 2회차가 0개였고 경고도 없었다.
    expect(second.components.length).toBe(first.components.length);
    expect(second.components.map((c) => c.label)).toEqual(first.components.map((c) => c.label));
  });

  it('호출자의 버퍼를 detach 하지 않는다', async () => {
    const source = new Uint8Array([37, 80, 68, 70, 1, 2, 3, 4]).buffer;
    await parsePdfToSLD(source, { pageNumber: 1 });

    // 호출자는 자기 버퍼를 계속 쓸 수 있어야 한다 — 83p 설계세트는 페이지마다
    // 같은 원본을 다시 읽는다.
    expect(source.byteLength).toBe(8);
    // 그리고 파서는 매번 온전한 바이트를 넘겼다(0 이면 detach 된 것을 넘긴 것).
    expect(transferred).toEqual([8]);
  });
});
