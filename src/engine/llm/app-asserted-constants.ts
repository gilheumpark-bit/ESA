import { canonicalMagnitude } from './quantity-token';

/**
 * 앱이 이미 근거와 함께 내보내는 도메인 상수 — 출력 필터가 지우지 않도록.
 *
 * 예외 목록이 아니다. `/field` 체크리스트가 조문과 함께 보여 주는 값에
 * 챗에서도 같은 근거를 붙여 주는 장치다. 그래서 `source` 가 필수다.
 *
 * 통과 조건은 셋 전부다: 값·단위 정확 일치 · 근처에 대상 용어 · 여기 등재.
 * 용어 조건이 없으면 황화수소 문장에 일산화탄소 값이 들어가도 통과한다.
 */

export interface AppAssertedConstant {
  value: string;
  /** 없으면 빈 문자열 — 그때는 용어 근접만으로 판단한다. */
  unit: string;
  /** 이 값이 무엇의 값인지 — 근처에 하나라도 있어야 통과. */
  terms: readonly string[];
  /** Explicit identity for linked constants whose aliases differ. */
  subject?: string;
  /**
   * 등급·구간처럼 같은 대상 안에서 값이 갈릴 때 **반드시** 근처에 있어야
   * 하는 식별자. 없으면 `"Class 4 절연장갑 500V"`(정답 36,000V)가 IEC 60903
   * 출처를 달고 통과한다 — 22.9kV 작업자에게 1,000V 장갑을 승인하는 길이다.
   */
  discriminator?: string;
  /** 앱이 이 값을 내보낼 때 함께 쓰는 근거. 비워 둘 수 없다. */
  source: string;
}

/** ASCII identifiers need both boundaries: CO is not CO2, Class 0 is not Class 00. */
const tokenPatterns = new Map<string, RegExp>();
function hasToken(context: string, token: string): boolean {
  let pattern = tokenPatterns.get(token);
  if (!pattern) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s*').replace(/(\d)([A-Za-z])/g, '$1\\s*$2');
    const head = /^[A-Za-z0-9]/.test(token) ? '(?<![A-Za-z0-9_])' : '';
    const tail = /[A-Za-z0-9]$/.test(token) ? '(?![A-Za-z0-9_])' : '';
    pattern = new RegExp(head + escaped + tail, 'i');
    tokenPatterns.set(token, pattern);
  }
  return pattern.test(context);
}

/**
 * 등재 기준: **앱의 다른 화면이 이미 이 값을 이 출처와 함께 보여 주고
 * 있을 것.** 새 값을 여기서 만들지 않는다 — 그건 발명이다.
 */
export const APP_ASSERTED_CONSTANTS: readonly AppAssertedConstant[] = [
  // ── 적정공기 (안전보건규칙 제618조) — /field 체크리스트가 그대로 표시 ──
  { value: '18', unit: '%', terms: ['산소', 'O2', 'O₂'], source: '안전보건규칙 제618조(적정공기)' },
  { value: '23.5', unit: '%', terms: ['산소', 'O2', 'O₂'], source: '안전보건규칙 제618조(적정공기)' },
  { value: '1.5', unit: '%', terms: ['이산화탄소', '탄산가스', 'CO2', 'CO₂'], source: '안전보건규칙 제618조(적정공기)' },
  { value: '30', unit: 'ppm', terms: ['일산화탄소', 'CO'], source: '안전보건규칙 제618조(적정공기)' },
  { value: '10', unit: 'ppm', terms: ['황화수소', 'H2S', 'H₂S'], source: '안전보건규칙 제618조(적정공기)' },

  // ── 폭염작업 (2025-06-01 시행 온열질환 예방 조항) ──
  // 단위 토큰을 ℃로 명시한다. 파서가 °C도 같은 단위로 정규화한다.
  { value: '31', unit: '℃', terms: ['체감온도'], source: '안전보건규칙 온열질환 예방 조항(2025-06-01 시행)' },

  // ── 충전전로 접근 한계거리 (제321조 제1항 표) ──
  // 두 행이 `접근 한계거리` 를 공유하므로 **전압을 식별자로 못 박는다**.
  // 안 그러면 154kV 문장에 22.9kV 행이 걸려 정답까지 모순으로 잡힌다.
  { value: '0.9', unit: 'm', discriminator: '22.9kV', terms: ['접근 한계거리', '접근한계거리'], source: '안전보건규칙 제321조 제1항' },
  { value: '1.7', unit: 'm', discriminator: '154kV', terms: ['접근 한계거리', '접근한계거리'], source: '안전보건규칙 제321조 제1항' },

  // ── 절연장갑 등급 (IEC 60903) ──
  // 등급 없이 "절연장갑 500V" 라고만 쓰면 통과하지 않는다 — 어느 등급인지
  // 모르는 전압은 현장에서 위험하다.
  //
  // DEBT-SAFETY-001: Class 1~4 는 이 앱의 다른 화면이
  // 보여 주지 않는 값이라 아래 등재 기준을 어긴다. 빼면 22.9kV 활선의 실제
  // 등급(Class 3·4)을 챗이 말할 수 없고, 두면 앱이 출처가 된다. 폐쇄 조건과
  // 현재 억제책은 docs/TECHNICAL_DEBT.md에서 추적한다.
  { value: '500', unit: 'V', discriminator: 'Class 00', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '1000', unit: 'V', discriminator: 'Class 0', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '7500', unit: 'V', discriminator: 'Class 1', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '17000', unit: 'V', discriminator: 'Class 2', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '26500', unit: 'V', discriminator: 'Class 3', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '36000', unit: 'V', discriminator: 'Class 4', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },

  // ── 이 앱이 쓰는 판 — "어느 표준을 쓰나요" 에 답할 수 있어야 한다 ──
  { value: '1584', unit: '', subject: 'arc-flash-standard-identity', terms: ['IEEE', '아크플래시', 'arc flash'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
  { value: '2002', unit: '', subject: 'arc-flash-standard-identity', terms: ['1584'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
];

/** 표기 흔들림 흡수 — 쉼표·공백 제거, 전각 기호 통일. */
function normalize(token: string): string {
  return token.replace(/,/g, '').replace(/\s+/g, '').trim();
}

/** Resolve one subject and one class/voltage before comparing any value.
 * A local discriminator wins over remote mentions. A remote discriminator is
 * used only when it is unique; ambiguity (including unknown classes) fails closed.
 * Multiple bounds of the SAME subject, such as oxygen, remain valid candidates.
 */
function resolveCandidates(unit: string | undefined, context: string, scope: string) {
  const candidates = APP_ASSERTED_CONSTANTS.filter((c) =>
    normalize(c.unit) === normalize(unit ?? '') && c.terms.some((term) => hasToken(context, term)),
  );
  if (!candidates.length) return { candidates, ambiguous: false };
  const subjects = new Set(candidates.map((c) => c.subject ?? c.terms.join('|')));
  if (subjects.size !== 1) return { candidates, ambiguous: true };
  if (!candidates.some((c) => c.discriminator)) return { candidates, ambiguous: false };

  const classFamily = candidates.some((c) => c.discriminator?.startsWith('Class'));
  const identifiers = (text: string) => new Set(
    [...text.matchAll(classFamily
      ? /(?<![A-Za-z0-9_])Class\s*\d+(?![A-Za-z0-9_])/gi
      : /(?<![A-Za-z0-9_.])\d+(?:\.\d+)?\s*kV(?![A-Za-z0-9_])/gi,
    )].map((m) => normalize(m[0]).toLowerCase()),
  );
  const local = identifiers(context);
  const selected = local.size ? local : identifiers(scope);
  if (selected.size !== 1) return { candidates, ambiguous: true };
  const matched = candidates.filter((c) => c.discriminator
    && selected.has(normalize(c.discriminator).toLowerCase()));
  return { candidates: matched.length ? matched : candidates, ambiguous: !matched.length };
}

export function findContradiction(
  value: string,
  unit: string | undefined,
  context: string,
  scope: string = context,
): { expected: string; source: string } | null {
  const { candidates, ambiguous } = resolveCandidates(unit, context, scope);
  if (!candidates.length) return null;
  if (ambiguous) return { expected: '대상·등급·전압을 하나씩 특정한 뒤 개별 검증 필요', source: candidates[0].source };
  if (candidates.some((c) => canonicalMagnitude(c.value) === canonicalMagnitude(value))) return null;
  return {
    expected: candidates.map((c) => `${c.value}${c.unit}`).join(' 또는 '),
    source: candidates[0].source,
  };
}

export function findAssertedSource(
  value: string,
  unit: string | undefined,
  context: string,
  scope: string = context,
): string | null {
  const { candidates, ambiguous } = resolveCandidates(unit, context, scope);
  if (ambiguous) return null;
  return candidates.find((c) => canonicalMagnitude(c.value) === canonicalMagnitude(value))?.source ?? null;
}
