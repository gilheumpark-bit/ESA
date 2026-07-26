/**
 * 계기용 변성기를 전력 변압기로 세지 않는다.
 *
 * 실측 2026-07-27: 저압 배전반 실도면(세종시 공개)의 `P.T x 3 (MOLD) 380V/190V`
 * 가 `transformer` 로 나왔다. 물리적으로 변압기는 맞지만, 이 앱에서
 * `transformer` 는 **전력 변압기**를 뜻하고 변압기 용량·단락전류 계산의 입력이
 * 된다. 그 도면에 전력 변압기는 0 인데 1 로 세어지면 하류가 통째로 어긋난다.
 *
 * 사전(pdf-vector-parser)은 이미 `PT|CT → meter` 였다. 비전 경로만 달랐던
 * 것이라 이 수리는 새 규칙이 아니라 두 경로를 같은 규칙으로 맞춘 것이다.
 */
import { parseSLDResponse } from '@/lib/sld-recognition';

/** 모델이 냈을 법한 응답을 그대로 만든다. */
function modelSaid(components: Array<{ type: string; label: string }>): string {
  return JSON.stringify({
    components: components.map((c, i) => ({
      id: `comp_${i + 1}`,
      type: c.type,
      label: c.label,
      position: { x: 50, y: 50 },
    })),
    connections: [],
    confidence: 0.9,
    rawDescription: 'test',
  });
}

describe('계기용 변성기 분류', () => {
  it.each([
    'P.T x 3 (MOLD) 380V/190V',
    'PT',
    'C.T 200/5',
    'CT 100/5A',
    'ZCT',
    'Z.C.T',
    'MOF',
    'VT 22.9kV',
    '계기용 변성기',
    '영상변류기',
  ])('%s 는 transformer 가 아니라 meter 로 센다', (label) => {
    const r = parseSLDResponse(modelSaid([{ type: 'transformer', label }]));
    expect(r.components[0].type).toBe('meter');
  });

  it('전력 변압기는 그대로 둔다 — 과잉 보정하면 진짜 변압기가 사라진다', () => {
    for (const label of ['TR-1 1000kVA', '주변압기 22.9kV/380V', 'Power Transformer 500kVA', 'MOLD TR 3φ']) {
      const r = parseSLDResponse(modelSaid([{ type: 'transformer', label }]));
      expect(r.components[0].type).toBe('transformer');
    }
  });

  it('다른 타입은 건드리지 않는다 — PT 라벨이 붙은 계기를 또 옮기지 않는다', () => {
    const r = parseSLDResponse(modelSaid([{ type: 'meter', label: 'PT LINE 전압계' }]));
    expect(r.components[0].type).toBe('meter');
  });

  it('조용히 고치지 않는다 — 보정 사실이 경고로 남는다', () => {
    const r = parseSLDResponse(modelSaid([{ type: 'transformer', label: 'P.T x 3 (MOLD)' }]));
    expect(r.warnings?.join(' ')).toContain('INSTRUMENT_TRANSFORMER_RECLASSIFIED');
    expect(r.warnings?.join(' ')).toContain('P.T x 3');
  });

  it('보정할 것이 없으면 경고도 없다', () => {
    const r = parseSLDResponse(modelSaid([{ type: 'transformer', label: 'TR-1 1000kVA' }]));
    expect(r.warnings ?? []).toEqual([]);
  });

  it('실도면 한 장 분량 — PT 만 옮기고 나머지는 그대로', () => {
    const r = parseSLDResponse(modelSaid([
      { type: 'transformer', label: 'P.T x 3 (MOLD) 380V / 190V' },
      { type: 'breaker', label: 'MCCB 4P 250AF 150AT' },
      { type: 'arrester', label: 'SPD' },
      { type: 'bus', label: 'LV 2' },
    ]));
    const byType: Record<string, number> = {};
    for (const c of r.components) byType[c.type] = (byType[c.type] ?? 0) + 1;
    expect(byType.transformer ?? 0).toBe(0);
    expect(byType.meter).toBe(1);
    expect(byType.breaker).toBe(1);
    expect(byType.arrester).toBe(1);
  });
});
