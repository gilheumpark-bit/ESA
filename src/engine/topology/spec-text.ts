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

  // 전류: 100A, 50AT
  const ampMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:A|AT)\b/);
  if (ampMatch) spec.current = parseFloat(ampMatch[1]);

  return spec;
}

// IDENTITY_SEAL: topology/spec-text | role=도면 텍스트 전기 스펙 파싱(DXF·PDF 공용) | inputs=text | outputs=ParsedSpec
