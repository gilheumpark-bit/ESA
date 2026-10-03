import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCustomRuleSet } from '@/engine/standards/custom-rules';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { executeSLDTeam } from '../sld-team';

jest.mock('@/engine/topology/dxf-parser', () => ({ parseDxfToSLD: jest.fn() }));

function ruleSet() {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'rules', 'example-company-rules.json'), 'utf8'));
  raw.articles[0].conditions[0].value = 2;
  const parsed = parseCustomRuleSet(raw);
  if (!parsed.ok || !parsed.ruleSet) throw new Error(parsed.errors.join(', '));
  return parsed.ruleSet;
}

function parserResult(length?: number, confidence = 0.9) {
  return {
    confidence,
    components: [
      { id: 'CB-1', type: 'breaker', label: 'CB-1', confidence: 0.9 },
      { id: 'LOAD-1', type: 'load', label: 'LOAD-1', confidence: 0.9 },
    ],
    connections: [{
      from: 'CB-1',
      to: 'LOAD-1',
      cableType: 'CV 3C 2.5sq Cu 20A 380V 3P PF 0.85',
      length,
    }],
    sourceTexts: [],
  };
}

async function run(length?: number, confidence?: number) {
  jest.mocked(parseDxfToSLD).mockReturnValue(parserResult(length, confidence) as never);
  return executeSLDTeam({
    sessionId: 'voltage-drop-evidence',
    classification: 'sld_dxf',
    fileBuffer: new TextEncoder().encode('mock dxf').buffer,
    customRuleSet: ruleSet(),
  });
}

describe('SLD connection voltage-drop evidence', () => {
  it('keeps the company-rule result on HOLD when cable length is absent', async () => {
    const result = await run();
    const finding = result.standards?.find((item) => item.standard === '사내규정' && item.clause === 'EX-3.2.1');

    expect(finding?.judgment).toBe('HOLD');
    expect(finding?.note).toMatch(/voltageDropPercent/);
  });

  it('uses decimal mm2, actual voltage, phase, and the verified calculator for a known case', async () => {
    const result = await run(40);
    const finding = result.standards?.find((item) => item.standard === '사내규정' && item.clause === 'EX-3.2.1');

    expect(finding?.judgment).toBe('FAIL');
    expect(finding?.note).toMatch(/voltageDropPercent=2\./);
  });

  /**
   * 빠른 경로(/api/dxf·/api/pdf-drawing)는 구조 확신도가 0.85 에 못 미치면 결선 기반
   * 판정을 내지 않는다. 팀 경로에는 그 문턱이 없어서, 표 문서나 격자 의심 페이지의
   * 결선으로도 전압강하 합격·불합격이 나갔다. 같은 문턱을 건다 — 값은 보여 주되 보류.
   */
  it('구조 확신도가 0.85 미만이면 결선 기반 전압강하를 판정하지 않고 보류한다', async () => {
    const result = await run(40, 0.55);
    const kec = result.standards?.find((item) => item.standard === 'KEC' && item.clause === '232.3.9');
    const company = result.standards?.find((item) => item.standard === '사내규정' && item.clause === 'EX-3.2.1');
    const calc = result.calculations?.find((item) => item.calculatorId === 'voltage-drop');

    expect(kec?.judgment).toBe('HOLD');
    expect(company?.judgment).toBe('HOLD');
    expect(calc?.compliant).toBeNull();
    expect(calc?.note).toMatch(/확신도/);
    expect((result.violations ?? []).some((v) => v.title === '전압강하 기준 초과')).toBe(false);
  });

  // 전압강하만 막으면 길이·굵기·전류로 판정하는 사내 기준은 같은 결선에서 그대로 합격이 나온다.
  it.each([[0.55, 'HOLD'], [0.9, 'PASS']])('길이로 판정하는 사내 기준도 구조 확신도 %s 에서는 %s 다', async (confidence, expected) => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'rules', 'example-company-rules.json'), 'utf8'));
    raw.articles[0].conditions[0] = { ...raw.articles[0].conditions[0], param: 'lengthM', operator: '<=', value: 100, unit: 'm' };
    const parsed = parseCustomRuleSet(raw);
    if (!parsed.ok || !parsed.ruleSet) throw new Error(parsed.errors.join(', '));
    jest.mocked(parseDxfToSLD).mockReturnValue(parserResult(40, confidence) as never);

    const result = await executeSLDTeam({
      sessionId: 'length-rule', classification: 'sld_dxf',
      fileBuffer: new TextEncoder().encode('mock dxf').buffer, customRuleSet: parsed.ruleSet,
    });

    expect(result.standards?.find((item) => item.standard === '사내규정' && item.clause === 'EX-3.2.1')?.judgment).toBe(expected);
  });

  it('구조 확신도가 문턱 이상이면 종전대로 판정한다', async () => {
    const result = await run(40, 0.9);
    const kec = result.standards?.find((item) => item.standard === 'KEC' && item.clause === '232.3.9');

    expect(['PASS', 'FAIL']).toContain(kec?.judgment);
  });
});
