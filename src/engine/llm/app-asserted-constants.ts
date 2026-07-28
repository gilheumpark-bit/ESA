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
  /**
   * 등급·구간처럼 같은 대상 안에서 값이 갈릴 때 **반드시** 근처에 있어야
   * 하는 식별자. 없으면 `"Class 4 절연장갑 500V"`(정답 36,000V)가 IEC 60903
   * 출처를 달고 통과한다 — 22.9kV 작업자에게 1,000V 장갑을 승인하는 길이다.
   */
  discriminator?: string;
  /** 앱이 이 값을 내보낼 때 함께 쓰는 근거. 비워 둘 수 없다. */
  source: string;
}

/** `Class 0` 은 `Class 00` 의 부분 문자열이다 — 뒤에 숫자가 더 붙으면 다른 등급. */
function hasToken(context: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = /\d$/.test(token) ? '(?!\\d)' : '';
  return new RegExp(esc + tail, 'i').test(context);
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
  // 단위가 비어 있는 이유: 필터의 숫자 정규식은 `%`·라틴문자·Ω 만 단위로 잡아
  // `℃` 는 인식하지 못한다. 용어는 `체감온도` 하나로 좁힌다 — `폭염` 을 넣으면
  // 폭염 문단의 아무 숫자나 걸린다.
  { value: '31', unit: '', terms: ['체감온도'], source: '안전보건규칙 온열질환 예방 조항(2025-06-01 시행)' },

  // ── 충전전로 접근 한계거리 (제321조 제1항 표) ──
  { value: '0.9', unit: 'm', terms: ['22.9kV', '접근 한계거리'], source: '안전보건규칙 제321조 제1항' },
  { value: '1.7', unit: 'm', terms: ['154kV', '접근 한계거리'], source: '안전보건규칙 제321조 제1항' },

  // ── 절연장갑 등급 (IEC 60903) ──
  // 등급 없이 "절연장갑 500V" 라고만 쓰면 통과하지 않는다 — 어느 등급인지
  // 모르는 전압은 현장에서 위험하다.
  //
  // TODO(등재 기준 위반·개발자 판단 대기): Class 1~4 는 이 앱의 다른 화면이
  // 보여 주지 않는 값이라 아래 등재 기준을 어긴다. 빼면 22.9kV 활선의 실제
  // 등급(Class 3·4)을 챗이 말할 수 없고, 두면 앱이 출처가 된다.
  { value: '500', unit: 'V', discriminator: 'Class 00', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '1000', unit: 'V', discriminator: 'Class 0', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '7500', unit: 'V', discriminator: 'Class 1', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '17000', unit: 'V', discriminator: 'Class 2', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '26500', unit: 'V', discriminator: 'Class 3', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },
  { value: '36000', unit: 'V', discriminator: 'Class 4', terms: ['절연장갑', '절연 장갑'], source: 'IEC 60903 등급별 최대 사용전압' },

  // ── 이 앱이 쓰는 판 — "어느 표준을 쓰나요" 에 답할 수 있어야 한다 ──
  { value: '1584', unit: '', terms: ['IEEE', '아크플래시', 'arc flash'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
  { value: '2002', unit: '', terms: ['1584'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
];

/** 표기 흔들림 흡수 — 쉼표·공백 제거, 전각 기호 통일. */
function normalize(token: string): string {
  return token.replace(/,/g, '').replace(/\s+/g, '').trim();
}

/** `context` 는 그 숫자의 주변 텍스트 — 대상 용어를 여기서 찾는다. */
export function findAssertedSource(
  value: string,
  unit: string | undefined,
  context: string,
): string | null {
  const v = normalize(value);
  const u = normalize(unit ?? '');
  for (const c of APP_ASSERTED_CONSTANTS) {
    if (normalize(c.value) !== v) continue;
    if (normalize(c.unit) !== u) continue;
    // 등급·구간이 갈리는 값은 그 식별자가 반드시 있어야 한다.
    if (c.discriminator && !hasToken(context, c.discriminator)) continue;
    if (!c.terms.some((t) => hasToken(context, t))) continue;
    return c.source;
  }
  return null;
}
