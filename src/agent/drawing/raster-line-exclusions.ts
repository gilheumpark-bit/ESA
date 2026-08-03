/**
 * 결정론적 직선 검출(raster-line-detector)에서 제외할 기기 영역.
 *
 * 직선 픽셀만으로는 도체와 표 테두리·표제란·기호 내부 획을 구분하지 못한다.
 * 그래서 살아남은 기호 근거의 경계를 마스크로 넘겨 기기 내부를 제외한다.
 * 이 모듈은 그 마스크만 계산하는 순수 함수다 — 픽셀을 읽지 않는다.
 *
 * PART 1: 기기 어휘 판별
 * PART 2: 제외 경계 계산
 */

import type { SymbolNode } from './types-v3';

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 마스크 계산에 필요한 페이지 속성만. 렌더 버퍼는 보지 않는다. */
export interface ExclusionPage {
  pageIndex: number;
  width: number;
  height: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 기기 어휘 판별
// ═══════════════════════════════════════════════════════════════════════════════

/** 모선은 도체 자체이므로 마스크로 덮으면 안 된다. */
const BUS_TOKENS = ['bus', 'busbar'] as const;

/** 반복 주택 부하는 지붕·문·여백이 회차마다 다르게 잡힌다. */
const LOAD_TOKENS = ['load', 'houseload', 'residentialload', 'house'] as const;

/** 세로가 가로의 이 비율 이상이면 온전한 몸통 판독으로 본다. */
const UPRIGHT_ASPECT_RATIO = 0.75;

/** 납작한 부하 판독(지붕만 등)을 아래로 넓힐 배수. */
const FLAT_LOAD_EXPANSION = 1.5;

function normalizeTypeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * `device-class.ts`의 `classifyDevice`를 쓰지 않는다. 그 함수는 근거 필드를
 * `confirmedType → rawLabel → typeCandidates[0]` 중 **하나만** 고르지만,
 * 제외 마스크는 후보 전체를 봐야 한다. 모선 후보가 두 번째 이후에 있으면
 * 마스크가 모선을 덮어 도체가 통째로 검출에서 사라진다.
 */
function hasTypeToken(symbol: SymbolNode, tokens: readonly string[]): boolean {
  return [symbol.confirmedType, ...symbol.typeCandidates]
    .filter((value): value is string => Boolean(value))
    .some((value) => tokens.includes(normalizeTypeToken(value)));
}

function unionBounds(left: Bounds, right: Bounds): Bounds {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const right_ = Math.max(left.x + left.w, right.x + right.w);
  const bottom = Math.max(left.y + left.h, right.y + right.h);
  return { x, y, w: right_ - x, h: bottom - y };
}

function largestByArea(candidates: readonly { bounds: Bounds }[]): Bounds | undefined {
  return candidates.reduce<Bounds | undefined>((best, candidate) =>
    !best || candidate.bounds.w * candidate.bounds.h > best.w * best.h
      ? candidate.bounds
      : best,
  undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 제외 경계 계산
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 납작하게 잡힌 부하는 지붕만 읽힌 경우다. 지붕 주변을 아래로 넓혀
 * 벽·창을 도체로 오인하지 않게 한다. 외부 배전선은 확장된 집 한 채보다
 * 길어서 그대로 남는다.
 */
function expandFlatLoad(bounds: Bounds, page: ExclusionPage): Bounds {
  const expandedWidth = bounds.w * FLAT_LOAD_EXPANSION;
  const expandedHeight = Math.max(bounds.h, bounds.w * FLAT_LOAD_EXPANSION);
  return {
    x: Math.max(0, bounds.x - (expandedWidth - bounds.w) / 2),
    y: bounds.y,
    w: Math.min(expandedWidth, page.width),
    h: Math.min(expandedHeight, Math.max(1, page.height - bounds.y)),
  };
}

function symbolExclusion(symbol: SymbolNode, page: ExclusionPage): Bounds | undefined {
  const pageEvidence = symbol.evidence.filter((evidence) => evidence.pageIndex === page.pageIndex);
  const primary = pageEvidence[0];
  const largest = largestByArea(pageEvidence);
  if (!primary || !largest) return undefined;

  const isLoad = hasTypeToken(symbol, LOAD_TOKENS);
  // 반복 부하는 근거 합집합이 가장 안전한 마스크다. 관측된 내부 획을 모두
  // 덮으면서 옆 부하로 번지지 않는다. 세로로 긴 변압기 글리프는 납작한
  // 권선 조각이 아닌 한 첫 판독을 유지한다.
  const bounds = isLoad
    ? pageEvidence.reduce((union, evidence) => unionBounds(union, evidence.bounds), { ...primary.bounds })
    : primary.bounds.h >= primary.bounds.w * UPRIGHT_ASPECT_RATIO
      ? primary.bounds
      : largest;

  return isLoad && bounds.h < bounds.w * UPRIGHT_ASPECT_RATIO
    ? expandFlatLoad(bounds, page)
    : bounds;
}

/**
 * 해당 페이지에서 직선 검출이 무시해야 할 기기 경계를 만든다.
 * 모선은 도체이므로 제외 대상에서 뺀다.
 */
export function equipmentExclusionBounds(
  page: ExclusionPage,
  pageSymbols: readonly SymbolNode[],
): Bounds[] {
  return pageSymbols
    .filter((symbol) => !hasTypeToken(symbol, BUS_TOKENS))
    .map((symbol) => symbolExclusion(symbol, page))
    .filter((bounds): bounds is Bounds => bounds !== undefined);
}

// IDENTITY_SEAL: agent/drawing/raster-line-exclusions | role=직선 검출 제외 마스크 계산 | inputs=SymbolNode[]·페이지 크기 | outputs=Bounds[]
