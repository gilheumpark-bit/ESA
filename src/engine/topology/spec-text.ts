/**
 * 도면 텍스트 → 전기 스펙 파싱 (DXF·PDF 공용)
 * ─────────────────────────────────────────────
 * DXF 파서와 PDF 파서가 각자 복사본을 들고 있었고, 그 사이에 규칙이 미세하게
 * 갈라져 있었다. 같은 버그를 두 번 고쳐야 하는 구조라 공용 경계로 옮긴다.
 */

export interface ParsedSpec {
  cableType?: string;
  conductorSize?: number;
  voltage?: number;
  current?: number;
  power?: number;
  powerUnit?: string;
  /** 차단기 극수 표기(예: '3P') — 분전반 일람 표기에서 추출 */
  poles?: string;
  /** 차단기 프레임 전류(AF) — "3P-50/20"의 50 */
  frameA?: number;
  /** 차단기 트립 전류(AT) — "3P-50/20"의 20. 존재 시 정격전류의 정본 */
  tripA?: number;
  /** 병렬 다조 수 — "150sq x 2"·"2조" 등. 허용전류는 조수배(버그 사냥 F5) */
  parallelCount?: number;
  /** 도체 재질 — AL/알루미늄 명시 시 'Al'. 미상은 undefined(판정층이 보수 처리·CRIT). */
  conductor?: 'Cu' | 'Al';
  /** KEC 허용전류 표의 명시 설치 조건. 표기가 없으면 기본값을 발명하지 않는다. */
  installationMethod?: 'conduit' | 'tray' | 'directBuried' | 'freeAir';
  /** 도면·표에 라벨과 함께 명시된 주위온도(°C). */
  ambientTemperature?: number;
  /** 같은 포설 그룹에 포함된 회로 수. 병렬 케이블 조수와 별개다. */
  groupedCircuitCount?: number;
  /** 계통의 예상 단락전류(kA). 차단기 차단용량과 구분한다. */
  prospectiveFaultCurrentKA?: number;
  /** 차단기의 정격 차단용량(kA). 예상 단락전류와 구분한다. */
  breakingCapacityKA?: number;
  /** 도면에 명시된 IEC 반한시 보호곡선. */
  protectionCurve?: 'SI' | 'VI' | 'EI';
}

export function parseSpecText(text: string): ParsedSpec {
  const spec: ParsedSpec = {};

  // 케이블 종류: CV, XLPE, HIV, FR-CV, FCV(난연 CV) 등. 긴 토큰을 먼저 둬 부분매칭
  // 방지. FCV/F-CV는 INSULATION_BY_CABLE엔 있으나 파서가 못 잡아 절연 미상으로
  // 빠지던 커버리지 갭(도메인 심사 수리 중 발각).
  const cableMatch = text.match(/\b(TFR-CV|FR-CV|F-CV|FCV|CV|XLPE|HFIX|HIV|IV|VV)\b/i);
  if (cableMatch) spec.cableType = cableMatch[1].toUpperCase();

  // 도체 재질: AL/알루미늄 명시 시 Al. 미상이면 undefined — 판정층은 미상을 Cu로
  // 낙관하지 않고 보수 처리한다(도메인 심사 HIGH: Al을 Cu로 판정해 ~28% 과대평가).
  if (/\bAL\b|알루미늄|알미늄/i.test(text)) spec.conductor = 'Al';
  else if (/\bCU\b|구리|동선/i.test(text)) spec.conductor = 'Cu';

  // 허용전류 보정 조건은 **라벨이 붙은 값만** 읽는다. `40°C`나 `3회로`가
  // 단독으로 보이면 기기 온도·회로 번호일 수 있어 KEC 입력으로 승격하지 않는다.
  const installationMatch = text.match(
    /(?:공사\s*방법|포설(?:\s*(?:방법|방식))?|installation(?:\s*method)?)\s*[:=\-]?\s*(전선관|관로|케이블\s*트레이|트레이|직매|지중\s*직매|기중|자유\s*공기|conduit|cable\s*tray|tray|direct\s*buried|free\s*air)/i,
  );
  if (installationMatch) {
    const method = installationMatch[1].replace(/\s+/g, ' ').toLowerCase();
    if (/전선관|관로|conduit/.test(method)) spec.installationMethod = 'conduit';
    else if (/트레이|tray/.test(method)) spec.installationMethod = 'tray';
    else if (/직매|direct buried/.test(method)) spec.installationMethod = 'directBuried';
    else if (/기중|자유 공기|free air/.test(method)) spec.installationMethod = 'freeAir';
  }

  const ambientMatch = text.match(/(?:주위\s*온도|주변\s*온도|ambient\s*temperature)\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i);
  if (ambientMatch) {
    const value = Number(ambientMatch[1]);
    if (Number.isFinite(value) && value >= -50 && value <= 200) spec.ambientTemperature = value;
  }

  const groupedMatch = text.match(/(?:집합\s*회로(?:\s*수)?|밀집\s*회로(?:\s*수)?|grouped\s*circuits?)\s*[:=\-]?\s*(\d+)\s*(?:회로|circuits?)?/i);
  if (groupedMatch) {
    const value = Number(groupedMatch[1]);
    if (Number.isInteger(value) && value >= 1 && value <= 200) spec.groupedCircuitCount = value;
  }

  const faultMatch = text.match(/(?:예상\s*단락\s*전류|추정\s*단락\s*전류|prospective\s*(?:short[- ]?circuit|fault)\s*current)\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*kA\b/i);
  if (faultMatch) spec.prospectiveFaultCurrentKA = Number(faultMatch[1]);
  const breakingMatch = text.match(/(?:정격\s*(?:차단\s*전류|차단\s*용량)|차단\s*용량|rated\s*(?:breaking\s*current|breaking\s*capacity)|breaking\s*capacity)\s*[:=\-]?\s*(\d+(?:\.\d+)?)\s*kA\b/i);
  if (breakingMatch) spec.breakingCapacityKA = Number(breakingMatch[1]);
  const curveMatch = text.match(/(?:보호\s*곡선|계전기\s*곡선|protection\s*curve|relay\s*curve|curve\s*type)\s*[:=\-]?\s*(SI|VI|EI)\b/i);
  if (curveMatch) spec.protectionCurve = curveMatch[1].toUpperCase() as ParsedSpec['protectionCurve'];

  // 병렬 다조: "150sq x 2"·"150sq×2"·"2조"·"P2" — 허용전류가 조수배가 되므로
  // 무시하면 옳은 도면을 과전류로 오판(버그 사냥 F5). 단면적 뒤 배수 또는 "N조".
  // "N조"는 조명/조립 등과 구분 위해 조 뒤 한글 배제(\b는 한글에 안 걸림).
  // 배수 뒤 C는 코어수(다심)지 병렬이 아니다 — "16sq×4C"를 4조로 오독 금지
  // (도메인 심사 CRIT: 다심을 병렬로 오독해 허용전류 ×N false-PASS). 단 C가 단어
  // 경계(코어수 "4C")일 때만 배제하고, 케이블 타입 "CV"의 C(뒤에 V가 이어짐)는
  // 삼키지 않는다 — `\b`로 한정(재심사 회귀 b: "16SQ×2 CV"의 병렬 2 유실 방지).
  const parMatch = text.match(/(?:sq|mm2|㎟)\s*[x×*]\s*(\d)(?!\s*C\b)/i) || text.match(/(\d)\s*조(?![가-힣])/);
  if (parMatch) {
    const n = parseInt(parMatch[1], 10);
    if (n >= 2 && n <= 9) spec.parallelCount = n;
  }

  // 도체 단면적: 16sq, 25mm2, 4C 16sq 등
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sq|mm2|㎟)/i);
  if (sizeMatch) spec.conductorSize = parseFloat(sizeMatch[1]);

  // 전력: 15kW, 100kVA, 10HP 등 — 전압보다 **먼저** 뽑고 원문에서 들어낸다.
  //
  // 전압 정규식이 'kVA'의 앞 두 글자 'kV'를 물어 500kVA 변압기가 500,000V로
  // 둔갑했다. 라이브 왕복(/api/dxf)에서 발각 — calcChain의 primaryVoltage로
  // 그대로 흘러가 계산 입력을 오염시키고 있었다. 단순 부정 전방탐색은
  // '400VAC' 같은 정상 표기까지 죽이므로, 전력 표기를 먼저 소비한다.
  // 단위 뒤에 글자가 이어지면 그 단위가 아니다: '400VAC'는 400 VA가 아니라
  // 400V 교류다. 긴 단위를 먼저 두어 kVA가 VA에 잘려나가지 않게 한다.
  const pwrMatch = text.match(/(\d+(?:\.\d+)?)\s*(kVAR|MVAR|kVA|MVA|kW|MW|HP|VA)(?![A-Za-z])/i);
  let rest = text;
  if (pwrMatch) {
    spec.power = parseFloat(pwrMatch[1]);
    spec.powerUnit = pwrMatch[2];
    rest = text.replace(pwrMatch[0], ' ');
  }

  // 전압: 22.9kV, 380V, 220V, 400VAC
  const voltMatch = rest.match(/(\d+(?:\.\d+)?)\s*(kV|V)/i);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1]);
    spec.voltage = voltMatch[2].toLowerCase() === 'kv' ? v * 1000 : v;
  }

  // 차단기 극수·AF/AT 정격: "3P-50/20"(bare)·"4P-400AF/400AT"(접미)·"MCCB 100/75"(키워드 문맥).
  // 실발주 분전반 일람 표기 — 골든 파일럿에서 구조화 결속 0%의 원인으로 실측된 공백.
  //
  // bare 슬래시(dd/dd)는 정격 말고도 전압쌍(380/220V)·감도전류(50/30mA)·날짜
  // (2021/04)와 충돌한다(버그 사냥 F1 실측: 전압쌍을 AF/AT로 오독→review 규칙
  // false-PASS/false-FAIL, "MCCB 400A 380/220V"의 실정격 400을 220으로 덮어씀).
  // 2번째 수가 V/mA로 이어지면 전기량이지 트립이 아니고, 앞자리 0(2021/04의 04)은
  // 날짜다 — 꼬리 부정탐색 + 사후 타당성(날짜·최대프레임 6300A)으로 배제한다.
  const polesMatch = rest.match(/(\d)\s*P\b/i);
  if (polesMatch) spec.poles = `${polesMatch[1]}P`;
  const TRIP_TAIL = String.raw`(?!\d)(?!\s*[Vv])(?!\s*mA)`;
  // AF/AT 사이 구분자는 슬래시·하이픈·공백 모두 허용 — 표의 별도 하위칸이 공백
  // 결합돼 "200AF 225AT"로 오면 슬래시 전용 정규식은 AT>AF 오류를 놓친다(도메인 심사 HIGH).
  let ftMatch = rest.match(/(\d{2,4})\s*AF\s*[/\s-]*(\d{2,4})\s*AT\b/i);
  let ftExplicit = ftMatch !== null; // AF/AT 명시 표기는 타당성 검사 면제
  if (!ftMatch) ftMatch = rest.match(new RegExp(String.raw`\dP\s*[-\s]\s*(\d{2,4})\s*\/\s*(\d{2,4})` + TRIP_TAIL, 'i'));
  // ASCII 약어는 \b, 한글 "차단기"는 \b가 안 걸리므로 경계 없이 부분매칭(누전/배선용차단기 포함).
  // NFB(No-Fuse Breaker) 추가 — 국내 실도면 관용 약어(도메인 심사 MED: NFB·한글 라벨 스킵).
  if (!ftMatch && /\b(?:MCCB|ELCB|ELB|ACB|VCB|MCB|NFB|CB)\b|차단기/i.test(text)) {
    ftMatch = rest.match(new RegExp(String.raw`(\d{2,4})\s*\/\s*(\d{2,4})` + TRIP_TAIL));
  }
  if (ftMatch) {
    const f = parseFloat(ftMatch[1]);
    const t = parseFloat(ftMatch[2]);
    // 날짜 배제: 앞자리 0(04월) + 연/월 쌍("12/2021"·"2021/12"). 4자리 정격(2000AF)은
    // 연도가 아니므로 보존한다(도메인 심사 HIGH: Q4 날짜를 정격으로 발명).
    const isYear = (s: string) => /^(?:19|20)\d\d$/.test(s);
    const isMonth = (s: string) => { const n = Number(s); return s.length <= 2 && n >= 1 && n <= 12; };
    const looksDate = /^0\d/.test(ftMatch[1]) || /^0\d/.test(ftMatch[2])
      || (isMonth(ftMatch[1]) && isYear(ftMatch[2]))
      || (isYear(ftMatch[1]) && isMonth(ftMatch[2]));
    if (ftExplicit || (!looksDate && f <= 6300 && t <= 6300)) {
      spec.frameA = f;
      spec.tripA = t;
    }
  }

  // 전류: 100A, 50AT
  const ampMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:A|AT)\b/);
  if (ampMatch) spec.current = parseFloat(ampMatch[1]);
  // 트립(AT)이 있으면 정격전류의 정본은 트립이다(프레임·잡음 매칭보다 우선).
  if (spec.tripA !== undefined) spec.current = spec.tripA;

  return spec;
}

// IDENTITY_SEAL: topology/spec-text | role=도면 텍스트 전기 스펙 파싱(DXF·PDF 공용) | inputs=text | outputs=ParsedSpec
