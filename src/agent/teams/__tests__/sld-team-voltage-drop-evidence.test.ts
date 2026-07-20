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

function parserResult(length?: number) {
  return {
    confidence: 0.9,
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

async function run(length?: number) {
  jest.mocked(parseDxfToSLD).mockReturnValue(parserResult(length) as never);
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
});
