/**
 * 기기 분류 — 앵커 없는 부분 문자열 매칭을 어휘 계층으로 교체
 * ─────────────────────────────────────────────────────────────────────────
 * 이전 구현은 `/breaker|vcb|acb|mccb|fuse|cb|rcd/.test(t)` 처럼 부분 문자열을
 * 봤다. `cb` · `gen` · `bar` 는 두세 글자라 무관한 토큰 안쪽에서도 걸린다
 * ("PCB" → 보호기, "agent" → 전원, "barrier" → 모선). 이 분류가
 * severity: 'critical' 소견("보호기 미확인")의 입력이므로 오탐이 곧 오판이다.
 *
 * 라틴 약호와 한국어 기기어는 매칭 규칙이 다르다:
 *   - 라틴 약호는 짧아 우연 일치 확률이 높다 → **토큰 전체 일치**만 인정한다.
 *   - 한국어 기기어는 공백 없는 복합어로 나타난다("주차단기", "배선용차단기").
 *     토큰 경계를 요구하면 전부 놓치므로 **선별된 장어휘의 부분 일치**를
 *     허용한다. 3음절 이상이라 우연 일치 확률이 라틴 2자 약호와 다르다.
 *
 * ■ 설계(2026-07-24 S2)에서 의도적으로 벗어난 점 — 단일 deviceClass 를 쓰지 않는다
 *
 * 설계는 노드마다 배타적 class 하나를 부여하자고 한다. 그러면 "GEN PANEL" 처럼
 * 전원이면서 부하로도 읽히던 노드가 한쪽으로 접힌다. 이전 구현에서 그런 노드는
 * sources 와 loads **양쪽** 목록에 들어가 경로 검사를 받았는데, 한쪽으로 접히면
 * 그 조합이 사라져 "경로에 보호기 없음" critical 이 조용히 소거된다. 설계는
 * 이 방향(소견 소거)을 분석하지 않았다. 검출을 줄이는 변경은 안전한 방향이
 * 아니므로 다중 소속을 유지하고, S2 의 실제 목적인 "앵커 없는 매칭 제거"만
 * 취한다.
 *
 * 분류 근거 필드의 우선순위는 설계 그대로다: confirmedType → rawLabel →
 * typeCandidates[0]. 어느 필드가 분류를 만들었는지 provenance 로 남긴다 —
 * typeCandidate 유래는 추측이므로 상류의 hasConfirmedType 계약이 그대로 적용된다.
 */

export type DeviceClass = 'source' | 'protection' | 'load' | 'bus';

/** 어느 필드가 분류를 만들었는가. typeCandidate 유래는 확정이 아니라 추측이다. */
export type ClassProvenance = 'confirmedType' | 'rawLabel' | 'typeCandidate' | 'none';

export interface DeviceClassification {
  classes: ReadonlySet<DeviceClass>;
  provenance: ClassProvenance;
  /** 분류 판단에 실제로 쓰인 텍스트. 사후에 왜 그렇게 분류됐는지 재구성할 수 있어야 한다. */
  basis: string;
}

/** 토큰 전체 일치만 인정하는 라틴 약호. 항목 추가 시 반증 테스트를 같이 넣을 것. */
const LATIN_TOKENS: ReadonlyArray<readonly [DeviceClass, readonly string[]]> = [
  ['source', ['source', 'incoming', 'grid', 'utility', 'generator', 'gen', 'genset', 'mains']],
  ['protection', ['breaker', 'cb', 'mccb', 'mcb', 'acb', 'vcb', 'elcb', 'elb', 'nfb', 'rcd', 'rccb', 'fuse']],
  ['load', ['load', 'motor', 'mcc', 'panel', 'feeder']],
  ['bus', ['bus', 'busbar', 'bar', 'bb']],
];

/** 부분 일치를 허용하는 한국어 기기어. 복합어로 붙어 나오므로 경계를 요구할 수 없다. */
const KOREAN_WORDS: ReadonlyArray<readonly [DeviceClass, readonly string[]]> = [
  ['source', ['발전기', '수전', '인입']],
  ['protection', ['차단기', '퓨즈']],
  ['load', ['전동기', '분전반', '부하']],
  ['bus', ['모선', '부스바']],
];

function latinTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean));
}

/** 분류 근거 텍스트와 그 출처를 우선순위대로 고른다. */
function pickBasis(node: {
  confirmedType?: string;
  rawLabel?: string;
  typeCandidates?: readonly string[];
}): { basis: string; provenance: ClassProvenance } {
  if (node.confirmedType) return { basis: node.confirmedType, provenance: 'confirmedType' };
  if (node.rawLabel) return { basis: node.rawLabel, provenance: 'rawLabel' };
  const candidate = node.typeCandidates?.[0];
  if (candidate) return { basis: candidate, provenance: 'typeCandidate' };
  return { basis: '', provenance: 'none' };
}

export function classifyDevice(node: {
  confirmedType?: string;
  rawLabel?: string;
  typeCandidates?: readonly string[];
}): DeviceClassification {
  const { basis, provenance } = pickBasis(node);
  const classes = new Set<DeviceClass>();
  if (!basis) return { classes, provenance, basis };

  const tokens = latinTokens(basis);
  for (const [cls, words] of LATIN_TOKENS) {
    if (words.some((w) => tokens.has(w))) classes.add(cls);
  }
  for (const [cls, words] of KOREAN_WORDS) {
    if (words.some((w) => basis.includes(w))) classes.add(cls);
  }
  return { classes, provenance, basis };
}

export function hasDeviceClass(
  node: { confirmedType?: string; rawLabel?: string; typeCandidates?: readonly string[] },
  cls: DeviceClass,
): boolean {
  return classifyDevice(node).classes.has(cls);
}

// IDENTITY_SEAL: agent/drawing/device-class | role=기기 분류 어휘 계층(라틴 토큰일치·한국어 부분일치) | inputs=SymbolNode 유사 | outputs=DeviceClassification
