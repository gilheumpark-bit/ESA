/**
 * 앱이 **이미 사용자에게 내보내고 있는** 도메인 상수 — 출처와 함께.
 *
 * 왜 필요한가(2026-07-28 라이브 실측). 출력 필터는 근거 없는 수치를
 * `[미확인]` 로 지운다. 옳은 규율이다. 그런데 사용자가 이렇게 물으면:
 *
 *   "밀폐공간 적정공기 기준이 뭔가요?"
 *   → "산소: [미확인] 이상 [미확인] 미만 / 이산화탄소: [미확인] 미만 …"
 *   "폭염작업 기준 온도는?"        → "체감온도 [미확인]℃"
 *   "절연장갑 Class 00은 몇 V?"    → "AC 최대 [미확인]"
 *   "이 앱은 어느 표준을 쓰나요?"  → "[미확인] 표준을 적용합니다"
 *
 * 같은 앱이 `/field` 체크리스트에서는 **그 값을 조문과 함께 그대로 보여
 * 준다.** 즉 앱은 이 값들을 말할 용의가 있는데 챗만 못 한다 — 보수적인
 * 게 아니라 **두 화면이 어긋나는 것**이고, 현장에서 가장 자주 묻는 질문에
 * 쓸모없는 답을 준다. 게다가 모든 숫자가 `[미확인]` 이면 사용자는 그 표시를
 * 곧 무시하게 된다(늑대 소년).
 *
 * **이 파일은 "숫자를 통과시키는 예외 목록"이 아니다.** 앱이 이미 근거를
 * 들고 있는 값에 **그 근거를 붙여 주는** 장치다. 그래서 각 항목에 출처가
 * 필수이고, 출처 없는 항목은 만들 수 없다(타입이 강제한다).
 *
 * 통과 조건이 좁다 — 셋을 모두 만족해야 한다:
 *   ① 값과 단위가 **정확히** 일치(범위·패턴 없음)
 *   ② 근처에 그 값의 **대상 용어**가 있음(예: 30ppm 은 "일산화탄소/CO" 문맥
 *      에서만. 그러지 않으면 황화수소 문장에 CO 값이 들어가도 통과한다)
 *   ③ 목록에 명시적으로 등재
 * 나머지는 전부 종전대로 지운다.
 */

export interface AppAssertedConstant {
  /** 답변에 나타날 수 있는 숫자(표기 정규화 후 비교). */
  value: string;
  /** 단위. 없으면 빈 문자열 — 그때는 용어 근접만으로 판단한다. */
  unit: string;
  /** 이 값이 무엇의 값인지 — 근처에 하나라도 있어야 통과. */
  terms: readonly string[];
  /**
   * **반드시** 근처에 있어야 하는 식별자 — 등급·구간처럼 같은 대상 안에서
   * 값이 갈리는 경우에만 쓴다.
   *
   * 왜 필요한가(2026-07-28 독립 심사 도메인 좌석 실행 실측): 절연장갑
   * 항목의 `terms` 에 `'절연장갑'` 이 들어 있어 **등급과 무관하게** 통과했다.
   *
   *   "Class 4 절연장갑의 최대 사용전압은 500V 입니다"  → 통과(출처 부여)
   *   "22.9kV 활선용 절연 장갑 정격 1000V"              → 통과(출처 부여)
   *
   * Class 4 는 36,000V 다. 22.9kV 작업자에게 1,000V 장갑을 "IEC 60903" 을
   * 달아 승인하는 경로였다 — 필터가 막으라고 있는 바로 그것을 만들었다.
   */
  discriminator?: string;
  /** 앱이 이 값을 내보낼 때 함께 쓰는 근거. 비워 둘 수 없다. */
  source: string;
}

/**
 * 식별자 근접 판정 — **부분 문자열이 아니라 경계로** 본다.
 *
 * `'Class 0'.includes` 로 보면 `"Class 00"` 안에서도 참이 된다. 실제로
 * 그랬다: Class 00(500V) 문장이 Class 0(1000V) 항목에 걸렸다. 뒤에 숫자가
 * 더 붙으면 다른 등급이다.
 */
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
  // 단위를 비워 둔다. 필터의 숫자 정규식이 잡는 단위는 `%`·라틴문자·Ω 뿐이라
  // `℃`·`°C` 는 **아예 단위로 인식되지 않는다**(2026-07-28 실측: `31℃` 의
  // unit 이 undefined 였다). 대신 용어를 `체감온도` 하나로 좁혀 둔다 —
  // `폭염` 까지 넣으면 폭염 문단의 아무 숫자나 걸릴 여지가 생긴다.
  { value: '31', unit: '', terms: ['체감온도'], source: '안전보건규칙 온열질환 예방 조항(2025-06-01 시행)' },

  // ── 충전전로 접근 한계거리 (제321조 제1항 표) ──
  { value: '0.9', unit: 'm', terms: ['22.9kV', '접근 한계거리'], source: '안전보건규칙 제321조 제1항' },
  { value: '1.7', unit: 'm', terms: ['154kV', '접근 한계거리'], source: '안전보건규칙 제321조 제1항' },

  // ── 절연장갑 등급 (IEC 60903) ──
  //
  // **6 등급을 전부 등재한다.** 앞서 00·0 두 줄만 있었다. 이 앱의 대상은
  // 154kV 수전설비고 22.9kV 활선의 실제 등급은 Class 3·4 인데, 그 값을
  // 챗이 말하면 목록에 없다는 이유로 `[미확인]` 로 지워졌다 — 앱이 구조적으로
  // 정답을 못 내고 오답(1000V)만 승인하는 상태였다.
  //
  // `discriminator` 로 등급을 못 박는다. 등급 없이 "절연장갑 500V" 라고만
  // 쓰면 통과하지 않는다 — 어느 등급인지 모르는 전압은 현장에서 위험하다.
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
 * 주어진 숫자가 앱이 근거와 함께 내보내는 값인지 — 맞으면 그 근거를 준다.
 *
 * @param value 숫자 문자열 (예: `'23.5'`)
 * @param unit  단위 문자열 (없으면 빈 문자열)
 * @param context 그 숫자 주변 텍스트 — 대상 용어를 여기서 찾는다
 */
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
