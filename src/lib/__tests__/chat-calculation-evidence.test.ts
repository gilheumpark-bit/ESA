import { filterLLMOutput } from '@/engine/llm/output-filter';
import { resolveChatCalculationEvidence } from '../chat-calculation-evidence';

describe('chat deterministic calculation evidence', () => {
  test('executes a complete voltage-drop query and makes only its receipt numbers trusted', () => {
    const evidence = resolveChatCalculationEvidence('전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9');

    expect(evidence).toMatchObject({ calculatorId: 'voltage-drop', input: { phase: 3, voltage: 380, current: 100, length: 50, cableSize: 35, conductor: 'Cu', powerFactor: 0.9 } });
    expect(typeof evidence?.result.value).toBe('number');
    expect(evidence?.result.judgment?.pass).toBe(true);
    expect(evidence?.promptContext).toContain('[SOURCE: ESA_CALCULATOR:voltage-drop]');
    expect(evidence?.promptContext).toContain('새로운 반올림 수치');

    const output = `전압강하는 ${evidence?.result.value}${evidence?.result.unit}입니다. [SOURCE: ESA_CALCULATOR:voltage-drop]`;
    expect(filterLLMOutput(output, [], evidence?.trustedText ?? '').passed).toBe(true);
    expect(filterLLMOutput('임의 결과는 999A입니다.', [], evidence?.trustedText ?? '').passed).toBe(false);
  });

  test('does not execute when a required input is missing or the query is not a calculation', () => {
    expect(resolveChatCalculationEvidence('전압강하 계산: 3상 380V 35mm2 Cu')).toBeNull();
    expect(resolveChatCalculationEvidence('VCB의 기능을 설명해줘')).toBeNull();
  });
});
