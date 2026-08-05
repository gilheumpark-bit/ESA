/**
 * 조립 품질 지표 — 라벨 점수가 못 재는 것을 잰다.
 *
 * ■ 왜 필요한가 (2026-08-05 실측)
 *
 * 코드가 사실상 동일한 두 팔에서 고급 도면 3회가 라벨 85~87% ↔ 85~100%,
 * 차단기 14/23/26 ↔ 11/22/20 으로 흔들렸다. 라벨 점수는 **모델이 무엇을
 * 읽었는가**에 지배되므로, 그보다 작은 조립기 변경은 잡음에 묻혀 탐지되지
 * 않는다. 자를 못 믿는 상태로 깎고 있었다.
 *
 * 여기서 재는 것은 정답과의 일치가 아니라 **조립기가 자기 입력을 얼마나 잘
 * 정리했는가** 다. "모델이 26개를 뱉었을 때 우리가 몇 개를 접었나"는 모델이
 * 20개를 뱉든 26개를 뱉든 물어볼 수 있는 질문이다. 그래서 절대 수가 아니라
 * **비율**을 정본 지표로 둔다 — 모델 변동이 분모로 나눠진다.
 *
 * ■ 지표
 *
 * - `unmergedPairRatio`   병합 후에도 남은 같은명판 근접쌍 / 확정 심볼.
 *                         조립기가 놓친 중복의 밀도다. 낮을수록 좋다.
 * - `sliverRatio`         같은 종류 중앙 크기의 40% 미만인 확정 심볼 비율.
 *                         조각을 기기로 세고 있는 정도다. 낮을수록 좋다.
 * - `ambiguousRatio`      모호 / 전체. 판정을 포기한 비율. 낮을수록 좋지만
 *                         0 이 좋은 것은 아니다 — 근거 없이 확정하면 이 값이
 *                         내려가면서 오탐이 오른다. 단독으로 읽지 말 것.
 * - `containedMarkings`   기기 몸체 안 표기로 강등한 수(절대값, 발화 확인용).
 * - `designatorLabels`    IEC 지정문자 라벨 수(절대값, 티어 적용 가능성 확인용).
 *
 * 이 값들은 정답 라벨을 필요로 하지 않는다. 그래서 정답이 없는 새 도면에도
 * 그대로 쓸 수 있다.
 */

const DESIGNATOR = /^(?:FU|QS|QF)\d/;

/** 명판 비교용 정규화. 공백은 하나로 줄이되 없애지 않는다(필드 경계 보존). */
function nameplateText(value) {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/** 두 라벨이 같은 명판인가. 짧은 쪽이 긴 쪽의 접두이되 숫자를 가르지 않을 것. */
export function sameNameplate(a, b) {
  const left = nameplateText(a);
  const right = nameplateText(b);
  if (left.length < 2 || right.length < 2) return false;
  if (!/[A-Z]/.test(left) || !/[A-Z]/.test(right)) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (!longer.startsWith(shorter)) return false;
  return !/[0-9]/.test(longer.charAt(shorter.length));
}

/** 서로의 짧은 변보다 가까운가. 도면 반대편의 동명 기기를 세지 않기 위한 결박. */
export function boundsAdjacent(a, b) {
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return gapX <= Math.min(a.w, b.w) && gapY <= Math.min(a.h, b.h);
}

function overlaps(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)
    && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * 한 실행의 조립 지표. `graph` 는 document.evidenceGraph, `unresolvedItems` 는
 * document.unresolvedItems 다. 정답 라벨을 쓰지 않는다.
 */
export function assemblyMetrics(graph, unresolvedItems = []) {
  const symbols = graph?.symbols ?? [];
  const confirmed = symbols.filter((s) => s.certainty === 'confirmed' && s.evidence?.length);
  const total = symbols.length;

  // 조각: 같은 종류 확정 심볼의 중앙 면적 대비 40% 미만.
  const areaByType = new Map();
  for (const s of confirmed) {
    const b = s.evidence[0].bounds;
    const key = s.confirmedType ?? '?';
    if (!areaByType.has(key)) areaByType.set(key, []);
    areaByType.get(key).push(b.w * b.h);
  }
  const medianByType = new Map([...areaByType].map(([k, v]) => [k, median(v)]));
  const slivers = confirmed.filter((s) => {
    const b = s.evidence[0].bounds;
    const med = medianByType.get(s.confirmedType ?? '?') ?? 0;
    return med > 0 && b.w * b.h < med * 0.4;
  });

  // 병합 후 남은 같은명판 근접쌍.
  let overlapping = 0;
  let adjacent = 0;
  for (let i = 0; i < confirmed.length; i++) {
    for (let j = i + 1; j < confirmed.length; j++) {
      const left = confirmed[i];
      const right = confirmed[j];
      if (left.confirmedType !== right.confirmedType) continue;
      if (!sameNameplate(left.rawLabel, right.rawLabel)) continue;
      const a = left.evidence[0];
      const b = right.evidence[0];
      if (a.pageIndex !== b.pageIndex) continue;
      if (!boundsAdjacent(a.bounds, b.bounds)) continue;
      if (overlaps(a.bounds, b.bounds)) overlapping++;
      else adjacent++;
    }
  }
  const unmergedPairs = overlapping + adjacent;

  return {
    symbols: total,
    confirmed: confirmed.length,
    ambiguous: symbols.filter((s) => s.certainty !== 'confirmed').length,
    relations: graph?.relations?.length ?? 0,
    lines: graph?.lines?.length ?? 0,
    unmergedPairs,
    unmergedOverlapping: overlapping,
    unmergedAdjacent: adjacent,
    slivers: slivers.length,
    containedMarkings: unresolvedItems.filter((i) => String(i.id ?? '').startsWith('contained-marking-')).length,
    designatorLabels: confirmed.filter((s) => DESIGNATOR.test(nameplateText(s.rawLabel).replace(/\s+/g, ''))).length,
    // 비율이 정본이다 — 모델이 몇 개를 읽었든 나눠진다.
    unmergedPairRatio: confirmed.length ? unmergedPairs / confirmed.length : 0,
    sliverRatio: confirmed.length ? slivers.length / confirmed.length : 0,
    ambiguousRatio: total ? (total - confirmed.length) / total : 0,
  };
}

/** 여러 실행을 최악·최선·폭으로 접는다. 평균은 쓰지 않는다 — 최악이 사용자가 만나는 값이다. */
export function foldAssemblyMetrics(runs) {
  if (runs.length === 0) return null;
  const keys = Object.keys(runs[0]);
  const folded = { runCount: runs.length };
  for (const key of keys) {
    const values = runs.map((run) => run[key]).filter((v) => Number.isFinite(v));
    if (values.length === 0) continue;
    folded[key] = {
      worst: Math.max(...values),
      best: Math.min(...values),
      spread: Math.max(...values) - Math.min(...values),
      values,
    };
  }
  return folded;
}

/** 비율 지표는 소수 3자리로 읽는다. 0.041 과 0.052 를 가르려면 그 정도가 필요하다. */
export function formatRatio(value) {
  return Number.isFinite(value) ? value.toFixed(3) : '-';
}
