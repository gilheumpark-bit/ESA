import sharp from 'sharp';

/**
 * 도면 이미지의 **글자 선명도**를 잰다 — AI 호출 전에.
 *
 * 왜 글자인가: 선은 흐려도 이어진 방향이 보이면 위상을 복원할 수 있다.
 * 글자는 못 읽으면 **장비 스펙을 모른다.** 실측에서 같은 변압기를
 * 500 → 300 / 1000kVA 로 두 번 다르게 읽었고, 그 답의 문서 confidence 는
 * 0.9 였다. 못 읽었다는 신호가 어디에도 없었다.
 *
 * 왜 전체 이미지 선명도가 아닌가: 도면마다 기준선이 다르다. 44 장 실측에서
 * 어떤 도면의 심한 스캔(2430)이 다른 도면의 원본(2337)보다 선명했다.
 * 글자 성분만 분리하면 밀도·복잡도와 무관한 값이 나온다.
 */

/** 판정 등급. `poor` 는 스펙 수치를 신뢰하면 안 되는 구간이다. */
export type TextQualityGrade = 'good' | 'marginal' | 'poor';

export interface TextQualityResult {
  grade: TextQualityGrade;
  /** 글자 성분의 획 경계 기울기 평균. 클수록 또렷하다. */
  strokeSharpness: number;
  /** 글자 성분 높이 중앙값(원본 px). */
  glyphHeightMedian: number;
  /** 검출된 글자 후보 수. 너무 적으면 판정 자체를 신뢰할 수 없다. */
  glyphCount: number;
  /** 판정 근거를 사람 말로 — 화면과 로그에 그대로 쓴다. */
  reason: string;
}

/**
 * 경계값.
 *
 * **근거가 약하다는 사실을 먼저 적는다.** 유일한 보정점은 KIMM p5 한 쌍이다 —
 * 같은 도면의 scan-light(64.5)는 변압기 용량 3/3 을 맞혔고 scan-heavy(56.8)는
 * 300/1000 을 오갔다. 두 값 사이를 갈랐을 뿐 물리 상수가 아니다.
 *
 * 다른 실패 사례(연결 0·차단기 수 감소)는 **선** 문제라 이 축의 보정점이
 * 아니다. 보정점을 늘리려면 페이지별로 "이 스펙 문자열을 읽었나" 정답이
 * 필요하다.
 *
 * 그래서 이 값들은 **관측된 실패 지점**이지 검증된 임계가 아니다. 바꾸려면
 * 새 보정점을 먼저 만들 것.
 */
export const TEXT_QUALITY_THRESHOLDS = {
  /** 이 아래에서 스펙 오독이 관측됐다(56.8). */
  poor: 60,
  /** 이 위에서 스펙을 정확히 읽었다(64.5 이상). 사이 구간은 미확인이다. */
  good: 70,
  /** 글자 후보가 이보다 적으면 판정을 신뢰하지 않는다. */
  minGlyphs: 20,
} as const;

/** 작업 해상도 — 원본이 커도 여기서 재고 높이만 원본 배율로 되돌린다. */
const WORK_WIDTH = 2000;
/** 한 성분이 이보다 크면 글자가 아니다(테두리·모선). */
const MAX_COMPONENT_PIXELS = 20_000;
/** 글자 후보 높이 상한(작업 해상도 px). */
const MAX_GLYPH_SIDE = 60;

function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * 8-이웃 연결성분 중 **글자다운 것**만.
 *
 * 선은 길고 얇아 종횡비에서 걸러지고, 테두리·모선은 크기에서 걸러진다.
 * 재귀 대신 반복 스택을 쓴다 — 큰 성분에서 스택이 넘친다.
 */
function findGlyphs(bin: Uint8Array, w: number, h: number): Box[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Box[] = [];

  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = w; let maxX = 0; let minY = h; let maxY = 0; let n = 0;
    let overflow = false;

    while (sp > 0) {
      const i = stack[--sp];
      const y = (i / w) | 0;
      const x = i - y * w;
      n++;
      if (n > MAX_COMPONENT_PIXELS) { overflow = true; break; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (bin[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
        }
      }
    }
    if (overflow) continue;

    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const aspect = cw / ch;
    const fill = n / (cw * ch);
    if (ch >= 4 && ch <= MAX_GLYPH_SIDE && cw <= MAX_GLYPH_SIDE * 3
        && aspect > 0.12 && aspect < 8 && fill > 0.12 && n >= 8) {
      out.push({ x: minX, y: minY, w: cw, h: ch });
    }
  }
  return out;
}

/** 글자 상자 **안에서만** 경계 기울기 평균. 획이 또렷할수록 크다. */
function strokeSharpness(gray: Uint8Array, w: number, h: number, glyphs: Box[]): number {
  let sum = 0;
  let n = 0;
  for (const g of glyphs.slice(0, 4000)) {
    const y1 = Math.min(h - 1, g.y + g.h);
    const x1 = Math.min(w - 1, g.x + g.w);
    for (let y = Math.max(1, g.y); y < y1; y++) {
      for (let x = Math.max(1, g.x); x < x1; x++) {
        const i = y * w + x;
        const gx = gray[i + 1] - gray[i - 1];
        const gy = gray[i + w] - gray[i - w];
        sum += Math.sqrt(gx * gx + gy * gy);
        n++;
      }
    }
  }
  return n ? sum / n : 0;
}

export async function measureTextQuality(bytes: Uint8Array): Promise<TextQualityResult> {
  const img = sharp(Buffer.from(bytes));
  const meta = await img.metadata();
  const { data, info } = await img
    .clone().greyscale()
    .resize({ width: WORK_WIDTH, fit: 'inside', withoutEnlargement: true })
    .raw().toBuffer({ resolveWithObject: true });

  const gray = new Uint8Array(data);
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const thr = otsuThreshold(hist, gray.length);

  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < thr ? 1 : 0;

  const glyphs = findGlyphs(bin, info.width, info.height);
  const scale = (meta.width ?? info.width) / info.width;
  const heights = glyphs.map((g) => g.h * scale).sort((a, b) => a - b);
  const glyphHeightMedian = heights.length
    ? Math.round(heights[Math.floor(heights.length / 2)] * 10) / 10
    : 0;
  const sharpness = Math.round(strokeSharpness(gray, info.width, info.height, glyphs) * 10) / 10;

  const T = TEXT_QUALITY_THRESHOLDS;

  // 글자를 거의 못 찾으면 **선명도 판정 자체가 무의미**하다. 좋다고 말하지
  // 않는다 — 글자가 없는 도면(순수 도형)일 수도, 이진화가 실패한 것일 수도 있다.
  if (glyphs.length < T.minGlyphs) {
    return {
      grade: 'marginal',
      strokeSharpness: sharpness,
      glyphHeightMedian,
      glyphCount: glyphs.length,
      reason: `글자로 볼 수 있는 요소를 ${glyphs.length}개만 찾았습니다.`
        + ' 글자 선명도를 판정할 근거가 부족하므로 스펙 수치는 원본과 대조하십시오.',
    };
  }

  if (sharpness < T.poor) {
    return {
      grade: 'poor',
      strokeSharpness: sharpness,
      glyphHeightMedian,
      glyphCount: glyphs.length,
      reason: `글자 획이 뭉개져 있습니다(선명도 ${sharpness}).`
        + ' 같은 수준의 도면에서 변압기 용량을 실제와 다르게 읽은 사례가 있습니다 —'
        + ' **정격·용량 같은 스펙 수치를 이 결과로 확정하지 마십시오.**'
        + ' 원본 PDF나 더 높은 해상도로 다시 올리면 정확도가 올라갑니다.',
    };
  }

  if (sharpness < T.good) {
    return {
      grade: 'marginal',
      strokeSharpness: sharpness,
      glyphHeightMedian,
      glyphCount: glyphs.length,
      reason: `글자 선명도가 경계 구간입니다(${sharpness}).`
        + ' 기기 종류는 대체로 읽히지만 숫자 한 자리 오독이 가능하므로'
        + ' 스펙 수치는 원본과 대조하십시오.',
    };
  }

  return {
    grade: 'good',
    strokeSharpness: sharpness,
    glyphHeightMedian,
    glyphCount: glyphs.length,
    reason: `글자 선명도 ${sharpness} — 스펙 판독에 충분한 수준입니다.`,
  };
}
