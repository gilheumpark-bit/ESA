/**
 * 도달 불가 주장의 반증 시도 .
 *
 * "이 판정은 어떤 입력으로도 불합격이 안 난다"는 코드를 읽고 낸 주장이다.
 * 코드 판독은 틀릴 수 있으니 입력공간을 넓게 훑어 반례를 찾는다.
 *
 * **이 파일이 초록이라고 좋은 상태가 아니다.** 아래 다섯은 어떤 입력으로도
 * 불합격이 나오지 않는 판정이다 — 가드가 장식이라는 뜻이고, 사용자가 "합격"을
 * 봐도 아무 정보가 없다. 모델을 고쳐 불합격이 나오기 시작하면 이 테스트가
 * 빨개진다. 그때는 테스트를 고칠 게 아니라 **목록에서 빼면 된다.**
 *
 * 1차 시도에서 ct-sizing 파라미터 이름을 틀리게 넘겨 전 조합이 예외로 죽었는데,
 * 탐침이 예외를 세지 않아 "불합격 0건"으로 읽혔다. 즉 **고장난 탐침과 진짜
 * 도달 불가를 구분할 수 없었다.** 그래서 예외 수를 따로 세고 유효 실행이 0 이면
 * 그 측정을 무효로 만든다.
 */
import { CALCULATOR_REGISTRY } from '@/engine/calculators';

type Outcome = { pass: number; fail: number; threw: number; firstFailure?: Record<string, unknown>; firstError?: string };

function grid(axes: Record<string, unknown[]>): Array<Record<string, unknown>> {
  let out: Array<Record<string, unknown>> = [{}];
  for (const k of Object.keys(axes)) {
    const next: Array<Record<string, unknown>> = [];
    for (const base of out) for (const v of axes[k]) next.push({ ...base, [k]: v });
    out = next;
  }
  return out;
}

function probe(id: string, axes: Record<string, unknown[]>): Outcome {
  const entry = CALCULATOR_REGISTRY.get(id);
  if (!entry) throw new Error(`not registered: ${id}`);
  const o: Outcome = { pass: 0, fail: 0, threw: 0 };
  for (const input of grid(axes)) {
    try {
      const r = entry.calculator(input as never) as { judgment?: { pass: boolean } };
      if (r.judgment?.pass === false) {
        o.fail++;
        o.firstFailure ??= input;
      } else o.pass++;
    } catch (e) {
      o.threw++;
      o.firstError ??= (e as Error).message;
    }
  }
  return o;
}

/** 유효 실행이 있었는지부터 확인한다 — 없으면 탐침이 고장난 것이다. */
function report(name: string, o: Outcome) {
  const ran = o.pass + o.fail;
  console.log(`${name}: 유효 ${ran} (합격 ${o.pass} / 불합격 ${o.fail}), 예외 ${o.threw}${o.firstError ? ` — ${o.firstError}` : ''}`);
  if (o.firstFailure) console.log(`  반례: ${JSON.stringify(o.firstFailure)}`);
  expect(ran).toBeGreaterThan(0);
}

describe('판정 도달 가능성 실측', () => {
  it('starting-current — 불합격 도달 불가 주장', () => {
    const o = probe('starting-current', {
      ratedPower: [0.1, 1, 11, 100, 1000, 10000],
      voltage: [100, 220, 380, 3300, 22900, 154000],
      efficiency: [0.01, 0.5, 0.9, 1],
      powerFactor: [0.01, 0.5, 0.85, 1],
      startingMethod: ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'],
    });
    report('starting-current', o);
    expect(o.fail).toBe(0);
  });

  it('equipotential-bonding — 불합격 도달 불가 주장', () => {
    const o = probe('equipotential-bonding', { largestPE: [0.5, 1, 4, 16, 50, 95, 240, 1000, 1e6] });
    report('equipotential-bonding', o);
    expect(o.fail).toBe(0);
  });

  it('grid-connect — 불합격 도달 불가 주장', () => {
    const o = probe('grid-connect', {
      pvCapacity: [0.1, 10, 100, 1000, 1e5],
      batteryCapacity: [0, 10, 100, 1000, 1e5],
      gridVoltage: [220, 380, 22900],
      contractDemand: [0.1, 10, 100, 1000, 1e5],
    });
    report('grid-connect', o);
    expect(o.fail).toBe(0);
  });

  it('ups-capacity — 불합격 도달 불가 주장', () => {
    const o = probe('ups-capacity', {
      loadPower: [0.1, 10, 1000],
      loadPF: [0.1, 0.8, 1],
      backupMinutes: [1, 15, 1440],
      inputVoltage: [220, 380],
      batteryVoltage: [12, 384],
      efficiency: [0.01, 1],
      safetyFactor: [1, 2],
      depthOfDischarge: [0.01, 1],
      cellVoltage: [12],
    });
    report('ups-capacity', o);
    expect(o.fail).toBe(0);
  });

  it('illuminance — 불합격 도달 불가 주장', () => {
    const o = probe('illuminance', {
      area: [1, 10, 100, 10000],
      requiredLux: [1, 100, 500, 2000, 100000],
      luminousFlux: [1, 100, 3000, 100000],
      utilizationFactor: [0.01, 0.5, 1],
      maintenanceFactor: [0.01, 0.8, 1],
      fixtureWattage: [1, 40, 1000],
    });
    report('illuminance', o);
    expect(o.fail).toBe(0);
  });

  // ── 대조군 — 도달 가능하다고 본 것들. 불합격이 안 나오면 내 분류가 틀렸다.
  it('대조군 ct-sizing — 부담이 표준 최대(60VA)를 넘으면 여유가 음수', () => {
    const o = probe('ct-sizing', {
      maxLoadCurrent: [10, 100, 1000],
      relayBurden: [1, 10, 100, 1000],
      leadLength: [1, 100, 1000],
      leadSize: [1.5, 2.5, 6],
      accuracyClass: ['0.2', '0.5', '1.0', '5P', '10P'],
    });
    report('ct-sizing', o);
    expect(o.fail).toBeGreaterThan(0);
  });

  it('대조군 power-factor — 역률 0.9 미만', () => {
    const o = probe('power-factor', {
      activePower: [0.01, 1, 10, 100, 1000],
      apparentPower: [0.01, 1, 10, 100, 1000],
    });
    report('power-factor', o);
    expect(o.fail).toBeGreaterThan(0);
  });
});
