import { parseElectricalParams, parseNameplateVisionResponse } from '../ocr-nameplate';

describe('nameplate vision response validation', () => {
  it('keeps only bounded typed fields and clamps confidence', () => {
    const parsed = parseNameplateVisionResponse(JSON.stringify({
      manufacturer: 'ESA Motor',
      voltage: '380V',
      phase: '3',
      language: 'ko',
      confidence: 4,
      metadata: { injected: true },
      model: { nested: 'invalid' },
    }));

    expect(parsed).toEqual(expect.objectContaining({
      manufacturer: 'ESA Motor',
      voltage: '380V',
      phase: '3',
      language: 'ko',
      confidence: 1,
    }));
    expect(parsed.model).toBeUndefined();
    expect(parsed).not.toHaveProperty('metadata');
  });

  it('fails closed on malformed output and does not grant inferred confidence', () => {
    expect(parseNameplateVisionResponse('not json')).toEqual(expect.objectContaining({
      rawText: 'not json',
      confidence: 0,
      language: 'unknown',
    }));
    expect(parseNameplateVisionResponse('[]').confidence).toBe(0);
  });
});

/**
 * **단위 뒤 글자를 안 보면 다른 물리량이 된다.**
 *
 * 라이브 실측(2026-07-29 · BYOK 실키 Gemini, wiki 단선도): 비전 모델은
 * `23 MVAR` 를 **정확히** 읽었는데 추출층이 `전력: 23MVA` 로 바꿔 놓고
 * "변압기 용량" 계산기를 권했다. 무효전력(MVAR)을 피상전력(MVA)으로 바꾼
 * 것이라 그대로 넘기면 용량 산정이 틀어진다.
 *
 * 원인은 정규식 `\d+\s*MVA` 에 경계가 없어 `MVAR` 의 앞부분에 걸린 것.
 * `kVA`↔`kVAR`, `kW`↔`kWh`(전력량)도 같은 함정이다.
 *
 * 못 잡으면 비워 두는 쪽이 맞다 — 이 화면의 값은 계산기 입력으로 흘러간다.
 */
describe('전력 단위 — 뒤에 글자가 더 붙으면 다른 단위다', () => {
  const power = (text: string) => parseElectricalParams(text).power;

  it.each([
    ['23 MVAR', '무효전력'],
    ['46 MVAR', '무효전력'],
    ['150 kVAR', '무효전력(kVAR)'],
    ['1200 kWh', '전력량'],
  ])('%s 는 전력으로 잡지 않는다 (%s)', (text) => {
    expect(power(text)).toBeUndefined();
  });

  it.each([
    ['1 MVA', '1MVA'],
    ['50 kVA', '50kVA'],
    ['5.5 kW', '5.5kW'],
    ['100 W', '100W'],
    ['정격출력: 22 kW', '22kW'],
  ])('%s 는 그대로 읽는다 → %s', (text, expected) => {
    expect(power(text)).toBe(expected);
  });

  /** 라이브에서 나온 원문 전체 — 이 안에 전력으로 읽을 값은 없다. */
  it('실제 OCR 원문(MW·MVAR만 있는 단선도)에서 kVA/MVA 를 지어내지 않는다', () => {
    const raw = ['▲ 75 MW', '▲ 23 MVAR', '85 MW ▲', '27 MVAR ▲',
      '▲ 200 MW', '▲ 96 MVAR', '▼ 40 MW', '▼ 46 MVAR'].join('\n');
    expect(power(raw)).toBeUndefined();
  });
});
