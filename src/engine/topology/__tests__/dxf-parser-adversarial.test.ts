/**
 * DXF 파서 적대 테스트 — 픽스처 15장으로 임계를 맞춘 뒤의 끼워맞춤을 반증한다.
 *
 * 15장이 전 지표 100%가 된 것은 수리의 결과이기도 하지만, 내가 그 15장을 보며
 * 임계(간격 60%·행 밴드 70%)를 골랐다는 사실도 동시에 참이다. 그래서 여기서는
 * **조정에 쓰지 않은 형태**로 같은 로직을 공격한다. 통과가 목표가 아니라
 * 어디서 깨지는지 아는 것이 목표다.
 */

import { parseDxfToSLD } from '../dxf-parser';

// ── 최소 DXF 조립기 (픽스처 생성기와 독립 — 같은 버그를 공유하지 않도록) ──
const p = (c: number | string, v: number | string) => `${c}\n${v}\n`;
const L = (x1: number, y1: number, x2: number, y2: number, layer = 'WIRE') =>
  p(0, 'LINE') + p(8, layer) + p(10, x1) + p(20, y1) + p(30, 0) + p(11, x2) + p(21, y2) + p(31, 0);
const I = (name: string, x: number, y: number) =>
  p(0, 'INSERT') + p(8, 'SYMBOL') + p(2, name) + p(10, x) + p(20, y) + p(30, 0);
const T = (s: string, x: number, y: number) =>
  p(0, 'TEXT') + p(8, 'TEXT') + p(10, x) + p(20, y) + p(30, 0) + p(40, 2.5) + p(1, s);
const C = (x: number, y: number, r: number) =>
  p(0, 'CIRCLE') + p(8, 'SYMBOL') + p(10, x) + p(20, y) + p(30, 0) + p(40, r);

function doc(entities: string[]): string {
  return (
    p(0, 'SECTION') + p(2, 'HEADER') + p(9, '$ACADVER') + p(1, 'AC1015') + p(0, 'ENDSEC') +
    p(0, 'SECTION') + p(2, 'ENTITIES') + entities.join('') + p(0, 'ENDSEC') +
    p(0, 'EOF')
  );
}

describe('적대 — 스펙 귀속을 지어내지 않는가', () => {
  it('두 심볼 정중앙의 텍스트는 어느 쪽에도 붙지 않는다', () => {
    // 근접 반경 밖 + 행 정렬 후보 2개 → 귀속 불가가 정답. 아무 쪽에나 붙이면 날조다.
    const dxf = doc([
      I('TR-1', 0, 100), I('TR-2', 0, 0),
      T('500kVA', 400, 50), // 두 심볼과 등거리, 어느 행에도 단독 소속 아님
      L(0, 100, 0, 0),
    ]);
    const r = parseDxfToSLD(dxf);
    const rated = r.components.filter((c) => c.rating);
    expect(rated).toHaveLength(0);
  });

  it('행 정렬 후보가 둘이면 포기한다 (같은 높이 심볼 2개)', () => {
    const dxf = doc([
      I('TR-1', 0, 0), I('TR-2', 200, 0), // 같은 y
      T('750kVA', 900, 0),
      L(0, 0, 200, 0),
    ]);
    const r = parseDxfToSLD(dxf);
    expect(r.components.filter((c) => c.rating)).toHaveLength(0);
  });

  it('가까운 심볼이 있으면 먼 심볼로 새지 않는다', () => {
    const dxf = doc([
      I('TR-1', 0, 0), I('TR-2', 0, 300),
      T('500kVA', 10, 5), // TR-1 바로 옆
      L(0, 0, 0, 300),
    ]);
    const r = parseDxfToSLD(dxf);
    const tr1 = r.components.find((c) => c.label?.includes('TR-1') || c.position.y === 0);
    const tr2 = r.components.find((c) => c.position.y === 300);
    expect(tr1?.rating).toBe('500kVA');
    expect(tr2?.rating).toBeUndefined();
  });
});

describe('적대 — 축척 불변', () => {
  const build = (s: number) =>
    doc([
      I('TR-1', 0 * s, 100 * s), I('ACB-1', 0 * s, 50 * s), I('DB-1', 0 * s, 0 * s),
      L(0 * s, 100 * s, 0 * s, 50 * s), L(0 * s, 50 * s, 0 * s, 0 * s),
      T('500kVA', 5 * s, 100 * s),
    ]);

  // 픽스처는 mm(×1)과 m(×0.001)만 썼다. 여기서는 조정에 쓰지 않은 배율을 넣는다.
  for (const scale of [0.001, 0.01, 1, 25.4, 1000, 100000]) {
    it(`배율 ${scale} — 결선 2·컴포넌트 3·정격 결합 유지`, () => {
      const r = parseDxfToSLD(build(scale));
      expect(r.components).toHaveLength(3);
      expect(r.connections).toHaveLength(2);
      expect(r.components.some((c) => c.rating === '500kVA')).toBe(true);
      // 허공 결선 0
      const ids = new Set(r.components.map((c) => c.id));
      for (const conn of r.connections) {
        expect(ids.has(conn.from)).toBe(true);
        expect(ids.has(conn.to)).toBe(true);
      }
    });
  }
});

describe('적대 — 분류기', () => {
  const typeOf = (blockName: string) => {
    const r = parseDxfToSLD(doc([I(blockName, 0, 0), I('DB-9', 0, 100), L(0, 0, 0, 100)]));
    return r.components.find((c) => c.position.y === 0)?.type;
  };

  it('1글자 키는 완전한 토큰일 때만 적용된다', () => {
    expect(typeOf('M-1')).toBe('motor');
    expect(typeOf('G-1')).toBe('generator');
    // 'm'/'g'를 포함하지만 토큰이 아닌 이름들 — 과거 전부 motor/generator로 샜다
    expect(typeOf('MCC-1')).toBe('panel');
    expect(typeOf('METER-1')).toBe('meter');
    expect(typeOf('SWGR-1')).toBe('panel');
    expect(typeOf('LIGHT-1')).toBe('load');
  });

  it('짧은 키가 긴 키를 가리지 않는다', () => {
    expect(typeOf('MTR-A1')).toBe('motor');      // 과거 'tr' → transformer
    expect(typeOf('LOAD-B')).toBe('load');       // 과거 'db' → panel
    expect(typeOf('MCCB-1')).toBe('breaker');
    expect(typeOf('TRANSFORMER-1')).toBe('transformer');
  });

  it('어휘에 없는 이름은 조용히 부하로 떨어진다 (예외 없음)', () => {
    expect(typeOf('ZZZ-9')).toBe('load');
    expect(typeOf('한글심볼')).toBe('load');
  });

  it('이름 없는 INSERT는 심볼이 되지 않는다 (분류 근거가 없으므로)', () => {
    // 현재 동작을 못박는다 — 블록명이 없으면 컴포넌트를 만들지 않고, 그 자리의
    // 선분 끝점은 접점(bus)으로 승격된다. 없는 근거로 타입을 지어내는 것보다 낫다.
    const r = parseDxfToSLD(doc([I('', 0, 0), I('DB-9', 0, 100), L(0, 0, 0, 100)]));
    const atOrigin = r.components.find((c) => c.position.y === 0);
    expect(atOrigin?.type).toBe('bus');
  });
});

describe('적대 — 레이어 필터 과잉 차단', () => {
  it('치수·해칭 레이어는 결선에서 빠진다', () => {
    const dxf = doc([
      I('TR-1', 0, 100), I('DB-1', 0, 0),
      L(0, 100, 0, 0, 'WIRE'),
      L(-50, 50, 50, 50, 'DIM'),
      L(-50, 60, 50, 60, 'HATCH'),
    ]);
    const r = parseDxfToSLD(dxf);
    expect(r.connections).toHaveLength(1);
  });

  it('알려진 과잉 차단 — 접두 일치라 GRID_POWER 같은 이름도 함께 빠진다', () => {
    // 이건 통과를 자랑하는 테스트가 아니라 **현재 동작을 못박아 두는** 테스트다.
    // 접두 규칙이라 'GRID'로 시작하는 전력 레이어는 결선에서 빠진다.
    // 실도면에서 이 이름을 쓰는 사례를 만나면 ignoreLayers 옵션으로 덮어야 한다.
    const dxf = doc([
      I('TR-1', 0, 100), I('DB-1', 0, 0),
      L(0, 100, 0, 0, 'GRID_POWER'),
    ]);
    const r = parseDxfToSLD(dxf);
    expect(r.connections).toHaveLength(0);

    // 옵션으로 무력화하면 살아난다 — 탈출구가 실제로 작동하는지 확인
    const r2 = parseDxfToSLD(dxf, { ignoreLayers: /^(hatch|dimension)$/i });
    expect(r2.connections).toHaveLength(1);
  });
});

describe('적대 — 퇴화 입력', () => {
  it('빈 도면은 빈 결과를 낸다 (예외 없음)', () => {
    const r = parseDxfToSLD(doc([]));
    expect(r.components).toHaveLength(0);
    expect(r.connections).toHaveLength(0);
  });

  it('DXF가 아닌 문자열은 confidence 0으로 떨어진다', () => {
    const r = parseDxfToSLD('this is not a dxf file at all');
    expect(r.components).toHaveLength(0);
    expect(r.confidence).toBe(0);
  });

  it('심볼 없이 선분만 있으면 접점으로 승격된다', () => {
    const r = parseDxfToSLD(doc([L(0, 0, 100, 0), L(100, 0, 100, 100)]));
    expect(r.components.every((c) => c.type === 'bus')).toBe(true);
    expect(r.connections.length).toBeGreaterThan(0);
    const ids = new Set(r.components.map((c) => c.id));
    for (const conn of r.connections) {
      expect(ids.has(conn.from) && ids.has(conn.to)).toBe(true);
    }
  });

  it('0길이 선분은 자기루프로 남지 않는다', () => {
    const r = parseDxfToSLD(doc([I('TR-1', 0, 0), I('DB-1', 0, 100), L(0, 0, 0, 100), L(50, 50, 50, 50)]));
    for (const conn of r.connections) expect(conn.from).not.toBe(conn.to);
  });

  it('심볼 1개짜리 도면에서도 텍스트가 결합된다 (간격 산출 불가 경로)', () => {
    const r = parseDxfToSLD(doc([C(0, 0, 10), T('M-1', 20, 0)]));
    expect(r.components).toHaveLength(1);
    expect(r.components[0].type).toBe('motor');
  });
});

describe('적대 — 물리 단위 근거', () => {
  it('단위 없는 좌표에는 미터 길이를 붙이지 않는다', () => {
    const result = parseDxfToSLD(doc([L(0, 0, 100, 0)]));
    expect(result.connections[0]?.length).toBeUndefined();
  });

  it('명시된 unitScale이 있을 때만 좌표 길이를 미터로 환산한다', () => {
    const result = parseDxfToSLD(doc([L(0, 0, 100, 0)]), { unitScale: 0.001 });
    expect(result.connections[0]?.length).toBe('0.1m');
  });
});

describe('적대 — 의미 엔티티 작업 예산', () => {
  it('중첩 탐색 전에 지정된 엔티티 예산을 초과한 도면을 중단한다', () => {
    const result = parseDxfToSLD(
      doc([I('TR-1', 0, 0), I('DB-1', 0, 100), L(0, 0, 0, 100)]),
      { maxEntities: 2 },
    );

    expect(result.confidence).toBe(0);
    expect(result.components).toHaveLength(0);
    expect(result.connections).toHaveLength(0);
    expect(result.rawDescription).toContain('DXF_RESOURCE_LIMIT');
  });
});
