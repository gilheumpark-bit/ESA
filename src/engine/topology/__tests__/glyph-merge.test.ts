/**
 * PDF 글자 조각 병합.
 *
 * pdfjs 는 CAD PDF 의 한글을 글자 단위로 내보내는 경우가 있다. 실측
 * (2026-07-26, KIMM 분전반결선도): 한글 텍스트 55개 중 33개가 1글자였고
 * "사"/"업"/"명" 이 같은 줄에 나란히 놓여 있었다. 이대로면 한글 라벨이 어떤
 * 키워드 매칭에도 걸리지 않는다 — 국내 도면에서 라벨 판독이 통째로 죽는다.
 */
import { mergeGlyphRuns, type PdfTextItem } from '../pdf-vector-parser';

/** 폰트 크기 f 로 x 부터 이어 쓴 글자들. 전각은 한 칸이 f, 반각은 0.6f. */
function glyphs(text: string, x: number, y: number, f = 10): PdfTextItem[] {
  const out: PdfTextItem[] = [];
  let cursor = x;
  for (const ch of text) {
    const w = /[가-힣]/.test(ch) ? f : f * 0.6;
    out.push({ text: ch, x: cursor, y, width: w, height: f, fontHeight: f, angle: 0 });
    cursor += w;
  }
  return out;
}

describe('글자 조각 병합', () => {
  it('붙어 있는 한글 글자를 한 낱말로 잇는다', () => {
    const merged = mergeGlyphRuns(glyphs('사업명', 100, 50));
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('사업명');
  });

  it('멀리 떨어진 글자는 잇지 않는다 — 표의 옆 칸이 붙으면 안 된다', () => {
    const cell1 = glyphs('종류', 100, 50);
    const cell2 = glyphs('수량', 300, 50);
    const merged = mergeGlyphRuns([...cell1, ...cell2]);
    expect(merged.map((m) => m.text)).toEqual(['종류', '수량']);
  });

  it('다른 줄은 섞지 않는다', () => {
    const merged = mergeGlyphRuns([...glyphs('상단', 100, 50), ...glyphs('하단', 100, 80)]);
    expect(merged.map((m) => m.text).sort()).toEqual(['상단', '하단']);
  });

  it('회전각이 다르면 잇지 않는다', () => {
    const flat = glyphs('가', 100, 50);
    const turned = glyphs('나', 110, 50).map((g) => ({ ...g, angle: 90 }));
    expect(mergeGlyphRuns([...flat, ...turned])).toHaveLength(2);
  });

  it('한 칸 띄어 쓴 자리는 공백으로 남긴다 — 토큰 경계가 무너지면 스펙 파서가 깨진다', () => {
    const a = glyphs('MCCB', 100, 50);
    // 공백 한 칸은 보통 0.3em 안팎이다(f=10 → 3pt). 그보다 넓게 벌어지면 다른
    // 항목으로 보는 것이 맞다 — 표의 옆 칸이 붙지 않아야 한다.
    const b = glyphs('3P', 100 + 4 * 6 + 3, 50);
    const merged = mergeGlyphRuns([...a, ...b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe('MCCB 3P');
  });

  it('항목이 하나뿐이면 그대로 둔다', () => {
    const one = glyphs('가', 0, 0);
    expect(mergeGlyphRuns(one)).toEqual(one);
  });
});

/**
 * CAD 표제란은 칸을 채우려고 자간을 벌린다. 실측(2026-07-26, KIMM 분전반결선도
 * 1페이지)의 **같은 라벨 안** 간격은 0.62~4.18em, **다른 라벨과의** 최소 간격은
 * 5.82em 이었다. 그 사이를 가른다.
 *
 * 수리 전 라이브: 한글 53개 중 31개가 1글자 → 수리 후 1개("대", 아래 참조).
 */
describe('자간을 벌린 표제란 라벨', () => {
  /** 간격 g(em)로 벌려 쓴 글자들. */
  function spaced(text: string, x: number, y: number, f = 3.5, gapEm = 0): PdfTextItem[] {
    const out: PdfTextItem[] = [];
    let cursor = x;
    for (const ch of text) {
      const w = /[가-힣]/.test(ch) ? f : f * 0.6;
      out.push({ text: ch, x: cursor, y, width: w, height: f, fontHeight: f, angle: 0 });
      cursor += w + gapEm * f;
    }
    return out;
  }

  it.each([
    ['일련번호', 0.62],
    ['도면번호', 0.63],
    ['사업명', 1.86],
    ['도면명', 2.26],
    ['축척', 2.00],
    ['주기', 3.74],
    ['설계', 4.07],
    ['수정', 4.18],
  ])('%s (%sem 자간) 를 한 낱말로 잇는다', (word, gapEm) => {
    const merged = mergeGlyphRuns(spaced(word, 100, 50, 3.5, gapEm as number));
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe(word);
  });

  it('한글 낱말 안에는 공백을 넣지 않는다 — "일 련 번 호" 는 어떤 키워드에도 안 걸린다', () => {
    expect(mergeGlyphRuns(spaced('일련번호', 100, 50, 3.5, 0.62))[0].text).toBe('일련번호');
  });

  it('5.82em 떨어진 다른 라벨은 잇지 않는다', () => {
    // 실측에서 가장 가까웠던 라벨 경계("토토"→"승").
    const a = spaced('토토', 100, 50, 3.5);
    const b = spaced('승인', 100 + 2 * 3.5 + 5.82 * 3.5, 50, 3.5, 4.07);
    const merged = mergeGlyphRuns([...a, ...b]);
    expect(merged.map((m) => m.text)).toEqual(['토토', '승인']);
  });

  it('이미 낱말인 것끼리는 넓은 임계를 쓰지 않는다', () => {
    // "한국기계연구원"과 "건축사사무소"는 7.97em 떨어져 있었다. 조각이 아니므로
    // 좁은 임계가 걸려야 한다 — 넓은 임계를 모두에게 주면 한 덩어리가 된다.
    const f = 12.9;
    const a: PdfTextItem = { text: '한국기계연구원', x: 0, y: 50, width: f * 7, height: f, fontHeight: f, angle: 0 };
    const b: PdfTextItem = { text: '건축사사무소', x: f * 7 + 2 * f, y: 50, width: f * 6, height: f, fontHeight: f, angle: 0 };
    expect(mergeGlyphRuns([a, b]).map((m) => m.text)).toEqual(['한국기계연구원', '건축사사무소']);
  });

  it('영문·숫자 사이의 벌어진 자리는 공백으로 남긴다', () => {
    // 한글과 달리 라틴 문자는 낱말 사이를 띄운다. "MCCB3P" 가 되면 스펙 파서의
    // 토큰 경계가 무너진다.
    const a = glyphs('MCCB', 100, 50);
    const b = glyphs('3P', 100 + 4 * 6 + 3, 50);
    expect(mergeGlyphRuns([...a, ...b])[0].text).toBe('MCCB 3P');
  });
});
