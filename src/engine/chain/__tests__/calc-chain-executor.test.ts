/**
 * 연쇄 계산 실행기.
 *
 * 이 파일이 없던 동안 체인은 **한 번도 실행된 적이 없었다**. 호출처 0·테스트 0
 * 인 채로 export 만 되어 있었고, 실제로 돌려 보면 1단계에서 즉사했다
 * (실측 2026-07-26: `ratedPower(undefined) must be a positive finite number`).
 * 프리셋 빌더가 다른 계산기 API 를 상대로 쓰여 있었기 때문이다.
 *
 * 그래서 여기서는 "함수가 있다" 가 아니라 **끝까지 흐르는가**를 본다.
 */
import { buildSubstationReviewChain, executeCalcChain, type ChainStep } from '../calc-chain-executor';

const INPUTS = {
  totalLoad_kW: 500,
  demandFactor: 0.7,
  powerFactor: 0.9,
  voltage_V: 380,
  cableLength_m: 50,
  systemVoltage_V: 22900,
};

/** 부가 출력에서 값만 꺼낸다. */
function output(step: { outputs: Record<string, unknown> }, key: string): number {
  const additional = step.outputs.additionalOutputs as Record<string, { value: number }> | undefined;
  return additional?.[key]?.value ?? (step.outputs[key] as number);
}

describe('수배전 검토 체인', () => {
  it('5단계가 끝까지 흐른다', async () => {
    const result = await executeCalcChain(buildSubstationReviewChain(INPUTS));
    expect(result.failedAt).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.success)).toBe(true);
  });

  it('앞 단계 결과가 뒷 단계 입력으로 실제로 건너간다', async () => {
    const result = await executeCalcChain(buildSubstationReviewChain(INPUTS));
    const [substation, shortCircuit, breaker, cable, drop] = result.steps;

    // ① 변압기 선정 용량이 단락전류 계산으로
    const transformerSize = output(substation, 'transformerSize');
    expect(transformerSize).toBeGreaterThan(0);
    // 단락전류는 변압기 용량에 비례한다 — 용량을 절반으로 주면 값이 달라져야 한다.
    const halved = await executeCalcChain([
      ...buildSubstationReviewChain(INPUTS).slice(0, 1),
      {
        ...(buildSubstationReviewChain(INPUTS)[1] as ChainStep),
        dependsOn: undefined,
        inputs: { systemVoltage: 380, cableLength: 50, transformerCapacity: transformerSize / 2 },
      },
    ]);
    expect(output(halved.steps[1], 'shortCircuitCurrent_kA'))
      .not.toBeCloseTo(output(shortCircuit, 'shortCircuitCurrent_kA'), 2);

    // ② 모선 정격전류가 차단기·케이블·전압강하로
    const busRating = output(substation, 'busRating');
    expect(output(breaker, 'minimumRating')).toBeCloseTo(busRating, 1);
    expect(output(cable, 'correctedAmpacity')).toBeGreaterThanOrEqual(busRating);

    // ③ 단락전류가 차단기 차단용량으로
    expect(output(breaker, 'requiredBreakingCapacity'))
      .toBeCloseTo(output(shortCircuit, 'shortCircuitCurrent_kA'), 2);

    // ④ 선정 굵기가 전압강하로 — 두 단계의 전압강하율이 같아야 한다.
    expect(output(drop, 'voltageDropPercent')).toBeCloseTo(output(cable, 'voltageDropPercent'), 2);
  });

  it('도메인 값이 손계산과 맞는다', async () => {
    const result = await executeCalcChain(buildSubstationReviewChain(INPUTS));
    const [substation, shortCircuit] = result.steps;

    // 모선 정격전류 = kVA×1000 / (√3 × 선간전압)
    const kva = substation.outputs.value as number;
    expect(output(substation, 'busRating'))
      .toBeCloseTo((kva * 1000) / (Math.sqrt(3) * INPUTS.voltage_V), 0);

    // 변압기 임피던스 = %Z/100 × V² / S
    const transformerSize = output(substation, 'transformerSize');
    expect(output(shortCircuit, 'sourceImpedance'))
      .toBeCloseTo((0.05 * INPUTS.voltage_V ** 2) / (transformerSize * 1000), 4);
  });

  it('참조한 단계 결과가 없으면 조용히 넘어가지 않고 멈춘다', async () => {
    const broken: ChainStep[] = [
      { id: 'a', calculatorId: 'voltage-drop', inputs: { voltage: 380, current: 60, length: 50, cableSize: 35 } },
      {
        id: 'b',
        calculatorId: 'voltage-drop',
        inputs: { voltage: 380, current: 60, length: 50 },
        dependsOn: { cableSize: 'a.그런출력없음' },
      },
    ];
    const result = await executeCalcChain(broken);
    expect(result.success).toBe(false);
    expect(result.failedAt).toBe('b');
    expect(result.steps[1].error).toContain('그런출력없음');
  });

  it('없는 계산기를 부르면 그 단계에서 멈춘다', async () => {
    const result = await executeCalcChain([
      { id: 'x', calculatorId: '없는계산기', inputs: {} },
    ]);
    expect(result.success).toBe(false);
    expect(result.failedAt).toBe('x');
  });
});
