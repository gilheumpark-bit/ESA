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
}

export function parseSpecText(text: string): ParsedSpec {
  const spec: ParsedSpec = {};

  // 케이블 종류: CV, XLPE, HIV, FR-CV 등
  const cableMatch = text.match(/\b(FR-CV|CV|XLPE|HIV|TFR-CV|HFIX|IV|VV)\b/i);
  if (cableMatch) spec.cableType = cableMatch[1].toUpperCase();

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
  // 날짜(2021/04)·분수(1/2) 오독 방지: P 토큰 또는 차단기 키워드 문맥에서만 bare 슬래시를 읽는다.
  const polesMatch = rest.match(/(\d)\s*P\b/i);
  if (polesMatch) spec.poles = `${polesMatch[1]}P`;
  let ftMatch = rest.match(/(\d{2,4})\s*AF\s*[/-]\s*(\d{2,4})\s*AT\b/i);
  if (!ftMatch) ftMatch = rest.match(/\dP\s*[-\s]\s*(\d{2,4})\s*\/\s*(\d{2,4})(?!\d)/i);
  if (!ftMatch && /\b(MCCB|ELCB|ELB|ACB|VCB|MCB|CB|차단기|누전차단기)\b/i.test(text)) {
    ftMatch = rest.match(/(\d{2,4})\s*\/\s*(\d{2,4})(?!\d)/);
  }
  if (ftMatch) {
    spec.frameA = parseFloat(ftMatch[1]);
    spec.tripA = parseFloat(ftMatch[2]);
  }

  // 전류: 100A, 50AT
  const ampMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:A|AT)\b/);
  if (ampMatch) spec.current = parseFloat(ampMatch[1]);
  // 트립(AT)이 있으면 정격전류의 정본은 트립이다(프레임·잡음 매칭보다 우선).
  if (spec.tripA !== undefined) spec.current = spec.tripA;

  return spec;
}

// IDENTITY_SEAL: topology/spec-text | role=도면 텍스트 전기 스펙 파싱(DXF·PDF 공용) | inputs=text | outputs=ParsedSpec
