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
  { value: '1584', unit: '', terms: ['IEEE', '아크플래시', 'arc flash'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
  { value: '2002', unit: '', terms: ['1584'], source: '이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)' },
];

/** 표기 흔들림 흡수 — 쉼표·공백 제거, 전각 기호 통일. */
function normalize(token: string): string {
  return token.replace(/,/g, '').replace(/\s+/g, '').trim();
}

/**
 * 앱이 아는 값과 **다른 값**을 말하고 있는가.
 *
 * 출처 태그를 조이는 것만으로는 못 막는 경로가 있다: 사용자가 질문에 숫자를
 * 적으면 그 숫자는 신뢰 입력이 되어 무검사로 통과한다. `"154kV 접근 한계거리
 * 1.6m 맞죠?"` 라고 물으면 모델의 동의가 그대로 나간다 — 실측된 사고가
 * 정확히 이 형태였고, 앱 체크리스트는 같은 값을 **1.7m** 라고 말한다.
 *
 * 그러니 통과 여부를 따지기 전에 **아는 값과 대조**한다. 우리가 정답을 들고
 * 있는데 다른 값이 나가는 것은, 그 숫자를 누가 적었든 막아야 한다.
 *
 * 등재된 값과 **같은 대상·같은 단위**인데 값이 다를 때만 잡는다. 대상 용어가
 * 없으면 무관한 문장이므로 건드리지 않는다.
 */
export function findContradiction(
  value: string,
  unit: string | undefined,
  context: string,
  /**
   * 식별자(전압 등)를 찾을 범위. 기본은 `context` 지만, **실제 답변에서는
   * 전압이 숫자 옆에 없다.** 라이브 실측(2026-07-29 · gemini-3.1-pro):
   *
   *   "제시하신 1.6m 가 정확한 접근 한계거리인지 …
   *    - 계통 전압: 154kV [확인]"
   *
   * 대상 용어(`접근 한계거리`)는 숫자 바로 옆에 있는데 `154kV` 는 여섯 줄
   * 아래 조건 목록에 있었다. ±60자 창으로는 식별자를 못 찾아 후보가 0 이
   * 되고 1.6m 이 그대로 나갔다 — 단위 검사는 통과하는데 **실전에서 발화하지
   * 않았다**(§2.2). 그래서 용어는 근처에서, 식별자는 답변 전체에서 찾는다.
   */
  scope: string = context,
): { expected: string; source: string } | null {
  const v = normalize(value);
  const u = normalize(unit ?? '');

  // 문맥에 해당하는 후보를 모은다. 같은 단위·같은 대상인 항목들이다.
  const candidates = APP_ASSERTED_CONSTANTS.filter((c) => {
    if (normalize(c.unit) !== u) return false;
    if (c.discriminator && !hasToken(scope, c.discriminator)) return false;
    return c.terms.some((t) => hasToken(context, t));
  });
  if (candidates.length === 0) return null;

  // **하나라도 일치하면 모순이 아니다.** 같은 대상에 값이 여럿인 경우가 있다
  // (적정공기 산소는 하한 18 과 상한 23.5 둘 다 정당하다). 하나만 보고
  // 판정하면 정답을 모순으로 잡는다 — 실측에서 실제로 그랬다.
  if (candidates.some((c) => normalize(c.value) === v)) return null;

  return {
    expected: candidates.map((c) => `${c.value}${c.unit}`).join(' 또는 '),
    source: candidates[0].source,
  };
}

/**
 * `context` 는 그 숫자의 주변 텍스트 — 대상 용어를 여기서 찾는다.
 *
 * `scope` 는 `findContradiction` 과 같은 이유로 넓다. 좁혀 두면 **앱이 아는
 * 정답조차 못 말한다**: 154kV 답변에서 `1.7m` 옆 60자에 전압이 없으면 등재
 * 조회가 실패해 `[미확인]` 이 된다. 틀린 값을 막는 쪽만 넓히고 맞는 값을
 * 좁혀 두면, 필터는 정답을 지우면서 오답만 통과시키는 방향으로 기운다.
 */
export function findAssertedSource(
  value: string,
  unit: string | undefined,
  context: string,
  scope: string = context,
): string | null {
  const v = normalize(value);
  const u = normalize(unit ?? '');
  for (const c of APP_ASSERTED_CONSTANTS) {
    if (normalize(c.value) !== v) continue;
    if (normalize(c.unit) !== u) continue;
    // 등급·구간이 갈리는 값은 그 식별자가 반드시 있어야 한다.
    if (c.discriminator && !hasToken(scope, c.discriminator)) continue;
    if (!c.terms.some((t) => hasToken(context, t))) continue;
    return c.source;
  }
  return null;
}
