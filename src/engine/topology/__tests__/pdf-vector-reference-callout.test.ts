import { parsePdfToSLD } from '../pdf-vector-parser';

/**
 * 도면 참조 콜아웃(육각형 안 "번호/약호")을 기기로 세지 않는다.
 *
 * 실측(2026-08-05, KIMM 수변전 단선결선도 p5): 벡터 경로가 변압기를 8대로
 * 읽었는데 실제는 4대다. 넘친 것 중 3개가 이 형태였다 —
 *
 *   마커   "1"@11.9,30.0 + "TR"@11.8,30.5   ← 그게 전부
 *   실기기 "CH" "(표준소비효율)" "MOLD TR-1" "6.6KV/220V" "3∅ 500KVA" …
 */

const PAGE_W = 1000;
const PAGE_H = 800;

// 텍스트 항목: [문자, x, y]. pdf.js 는 transform[4]=x, transform[5]=y 로 준다.
// 파서가 y 를 뒤집으므로(viewport.height - ty) 여기서도 뒤집어 넣는다.
function textItem(str: string, x: number, yFromTop: number) {
  return { str, transform: [1, 0, 0, 1, x, PAGE_H - yFromTop] };
}

const items: ReturnType<typeof textItem>[] = [];

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  OPS: { constructPath: 91 },
  getDocument: jest.fn(() => ({
    destroy: async () => undefined,
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 1000, height: 800 }),
        getTextContent: async () => ({ items }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        cleanup: () => undefined,
      }),
      destroy: async () => undefined,
    }),
  })),
}));

async function parse() {
  const bytes = new Uint8Array([37, 80, 68, 70, 1, 2, 3, 4]).buffer;
  return parsePdfToSLD(bytes, { pageNumber: 1 });
}

describe('도면 참조 콜아웃은 기기가 아니다', () => {
  beforeEach(() => { items.length = 0; });

  it('홑 숫자 바로 아래의 짧은 약호는 기기로 세지 않는다', async () => {
    // 실측 배치 그대로: 숫자가 약호 바로 위(같은 x, 페이지 높이의 0.5% 위).
    items.push(textItem('2', 320, 240));
    items.push(textItem('TR', 319, 244));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(0);
  });

  it('같은 자리의 진짜 변압기 명판은 그대로 센다', async () => {
    items.push(textItem('MOLD TR-1', 217, 246));
    items.push(textItem('6.6KV/220V', 217, 250));

    const result = await parse();
    const tr = result.components.filter((c) => c.type === 'transformer');
    expect(tr).toHaveLength(1);
    expect(tr[0].label).toContain('MOLD TR-1');
  });

  it('제원이 붙은 약호는 콜아웃이 아니다', async () => {
    // 숫자가 위에 있어도 제원 증거가 있으면 기기다.
    items.push(textItem('3', 500, 300));
    items.push(textItem('TR 500KVA', 500, 304));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(1);
  });

  it('숫자가 멀리 떨어져 있으면 콜아웃이 아니다', async () => {
    // 표의 번호 열처럼 떨어진 숫자는 콜아웃 근거가 아니다.
    items.push(textItem('4', 100, 240));
    items.push(textItem('TR', 500, 244));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(1);
  });

  it('약호 기기(CH·PL·SC)는 숫자가 없으면 그대로 남는다', async () => {
    items.push(textItem('SC', 200, 400));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'capacitor')).toHaveLength(1);
  });
});

describe('줄바꿈된 한국어 주석은 기기가 아니다', () => {
  beforeEach(() => { items.length = 0; });

  it('종결 표현이 다음 줄로 넘어간 주석 앞줄도 주석으로 본다', async () => {
    // 실측(2026-08-06, 교재형 22.9kV 수변전 단선결선도 p6): 주 6 이 두 줄로 잘려
    //   ① "…계통은 CNCV-W 케이블(수밀형) 또는 TR CNCV-W"   ← 마커 없음
    //   ② "(트리억제형)을 사용하여야 한다. 다만, 전력구"      ← 마커 있음
    // ① 의 `TR`(트리억제형 케이블 약호)이 전력변압기로 계수돼 정답 3 에 4 가 나왔다.
    items.push(textItem('지중 인입선의 경우에 22.9[kV-Y] 계통은 CNCV-W 케이블(수밀형) 또는 TR CNCV-W', 100, 900));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(0);
  });

  it('조사가 없는 설비 명판은 그대로 센다', async () => {
    // 토큰 5개 이상이어도 조사로 끝나는 토큰이 없으면 설비 라벨이다.
    items.push(textItem('MOLD TR-2 6.6kV/440V 3PH 1000kVA', 300, 400));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(1);
  });

  it('짧은 한글 명판은 주석 판정에 걸리지 않는다', async () => {
    items.push(textItem('수전용 변압기', 300, 600));

    const result = await parse();
    expect(result.components.filter((c) => c.type === 'transformer')).toHaveLength(1);
  });
});
