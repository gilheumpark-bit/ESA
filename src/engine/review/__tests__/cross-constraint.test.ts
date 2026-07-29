import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SLDComponent } from '@/lib/sld-recognition';

import { deriveConstraints, describeConstraints } from '../cross-constraint';

/**
 * **읽은 값들끼리 모순인지 본다.**
 *
 * 실측 실패 재현: 스캔 도면에서 500kVA 변압기를 300kVA 로 읽었고, 같은
 * 도면의 2 차측 ACB 2000A/380V 는 정확히 읽혔다. 300kVA 의 2 차 정격은
 * 456A 라 2000A 차단기와 4 배 어긋난다 — **대조만 했으면 그 자리에서
 * 잡혔다.** 아무도 대조하지 않아서 conf 0.9 로 나갔다.
 *
 * 이 층의 판정은 "틀렸다" 가 아니라 **"맞지 않는다 + 그것들로 보면 이
 * 범위다"** 다. 확정은 사람이 한다.
 */

function comp(over: Partial<SLDComponent> & Pick<SLDComponent, 'id' | 'type'>): SLDComponent {
  return { position: { x: 0, y: 0 }, ...over } as SLDComponent;
}

const ACB_2000A = comp({
  id: 'acb1', type: 'breaker', label: 'ACB-1', rating: '2000A', voltage: '380V',
});

describe('실측 실패 재현 — 300kVA 오독', () => {
  it('2000A/380V 차단기 옆의 300kVA 는 맞지 않는다고 말한다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '300kVA' }),
      ACB_2000A,
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].consistent).toBe(false);
  });

  it('실제 값 500kVA 는 범위 안이다 — 과잉 경보가 아님', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '500kVA' }),
      ACB_2000A,
    ]);
    expect(cs[0].consistent).toBe(true);
  });

  it('1000kVA 도 범위 안이다 — 경계를 좁게 잡아 정상을 막지 않는다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '1000kVA' }),
      ACB_2000A,
    ]);
    expect(cs[0].consistent).toBe(true);
  });
});

describe('못 읽었을 때 — 거절이 아니라 분석', () => {
  const cs = deriveConstraints([
    comp({ id: 'tr1', type: 'transformer', label: 'TR-1' }),
    ACB_2000A,
  ]);

  it('용량이 없어도 범위를 낸다', () => {
    expect(cs).toHaveLength(1);
    expect(cs[0].consistent).toBeNull();
    expect(cs[0].impliedMin).toBeGreaterThan(0);
    expect(cs[0].impliedMax).toBeGreaterThan(cs[0].impliedMin);
  });

  it('표준 용량으로 어느 급인지 말한다', () => {
    expect(cs[0].advice).toMatch(/표준 용량으로는 \d+kVA 급/);
  });

  it('무엇을 확인하면 되는지 말한다 — 여기서 끝내지 않는다', () => {
    expect(cs[0].advice).toMatch(/명판/);
  });

  /** 근거를 사람이 검증할 수 있어야 한다 — 숫자만 던지면 신뢰가 안 선다. */
  it('무엇으로 좁혔는지 근거를 적는다', () => {
    expect(cs[0].basis).toContain('2000');
    expect(cs[0].basis).toContain('380');
  });
});

describe('무발명 — 근거가 없으면 구속하지 않는다', () => {
  it('전압이 없으면 구속을 만들지 않는다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '500kVA' }),
      comp({ id: 'b1', type: 'breaker', label: 'ACB-1', rating: '2000A' }),
    ]);
    expect(cs).toHaveLength(0);
  });

  /**
   * **kW 를 kVA 로 쓰지 않는다.** 역률을 모르면 다른 양이고, 0.8 을 가정하면
   * 그 가정이 결론이 된다.
   */
  it('kW 표기는 피상전력으로 읽지 않는다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '300kW' }),
      ACB_2000A,
    ]);
    expect(cs[0].consistent).toBeNull();
  });

  /** 어느 차단기가 어느 변압기의 2차인지 모르면 맺지 않는다. */
  it('변압기가 여럿이면 구속하지 않는다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '300kVA' }),
      comp({ id: 'tr2', type: 'transformer', label: 'TR-2', rating: '1000kVA' }),
      ACB_2000A,
    ]);
    expect(cs).toHaveLength(0);
  });

  /** 고압 차단기는 2차측이 아니다 — VCB 를 저압 주차단기로 쓰면 안 된다. */
  it('고압 차단기만 있으면 구속하지 않는다', () => {
    const cs = deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '500kVA' }),
      comp({ id: 'vcb', type: 'breaker', label: 'VCB', rating: '630A', voltage: '22.9kV' }),
    ]);
    expect(cs).toHaveLength(0);
  });
});

describe('사람이 읽는 문단', () => {
  it('모순이면 눈에 띄게, 근거와 다음 행동을 함께 낸다', () => {
    const text = describeConstraints(deriveConstraints([
      comp({ id: 'tr1', type: 'transformer', label: 'TR-1', rating: '300kVA' }),
      ACB_2000A,
    ])).join('\n');
    expect(text).toMatch(/맞지 않습니다/);
    expect(text).toMatch(/근거:/);
    expect(text).toMatch(/확인하십시오/);
  });
});

/**
 * **배선 확인** — 만들었는데 아무도 안 쓰는 방어가 이 리포에서 반복해서
 * 났다(§2.2). 라우트를 실행하려면 실키가 필요해 여기서는 배선 존재만
 * 확인한다. 그 한계를 적어 둔다.
 */
describe('라우트가 이 구속을 실어 보낸다', () => {
  const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'sld', 'route.ts'),
    'utf8',
  );

  it('응답에 constraints 를 담는다', () => {
    expect(route).toMatch(/constraints:\s*deriveConstraints\(/);
  });

  it('품질이 나빠도 구속을 계산한다 — 조기 반환 뒤에 있지 않다', () => {
    const wired = route.indexOf('deriveConstraints(');
    const quality = route.indexOf('measureTextQuality(bytes)');
    expect(quality).toBeGreaterThan(-1);
    expect(wired).toBeGreaterThan(quality);
    // 품질 측정과 구속 사이에 품질을 이유로 한 조기 반환이 없어야 한다.
    const between = route.slice(quality, wired);
    expect(between).not.toMatch(/textQuality\.grade\s*===\s*'poor'[\s\S]{0,200}return/);
  });
});
