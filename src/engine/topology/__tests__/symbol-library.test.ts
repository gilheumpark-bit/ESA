/**
 * 고객사 심볼 라이브러리 — 축적 루프의 계약 검증.
 *
 * 사무소 워크플로 그대로 검증한다: ① 낯선 블록은 조용히 'load' 로 뭉개지지
 * 않고 unknownSymbols(이름·지문)로 보고된다 → ② 사용자가 그 지문을 종류와
 * 함께 라이브러리 JSON 에 넣는다 → ③ 같은 회사의 다음 도면에서 자동 인식된다.
 * ①→③ 이 한 테스트에서 실제 파서 왕복으로 이어진다 — 문서가 아니라 코드가
 * 이 루프를 보증해야 한다.
 */

import { parseDxfToSLD, resolveBlockType, resolveBlockTypeOrNull } from '../dxf-parser';
import { fingerprintBlock, indexSymbolLibrary, matchSymbol, parseSymbolLibrary } from '../symbol-library';
import type { SymbolLibrary } from '../symbol-library';

// ── 최소 DXF 조립기 (적대 테스트와 동형 — BLOCKS 섹션 추가) ──
const p = (c: number | string, v: number | string) => `${c}\n${v}\n`;
const L = (x1: number, y1: number, x2: number, y2: number, layer = 'WIRE') =>
  p(0, 'LINE') + p(8, layer) + p(10, x1) + p(20, y1) + p(30, 0) + p(11, x2) + p(21, y2) + p(31, 0);
const I = (name: string, x: number, y: number) =>
  p(0, 'INSERT') + p(8, 'SYMBOL') + p(2, name) + p(10, x) + p(20, y) + p(30, 0);

/** 블록 정의: 이름 + 내부 기하(LINE 목록 [x1,y1,x2,y2]). */
function B(name: string, lines: Array<[number, number, number, number]>): string {
  return (
    p(0, 'BLOCK') + p(8, '0') + p(2, name) + p(70, 0) +
    p(10, 0) + p(20, 0) + p(30, 0) + p(3, name) +
    lines.map(([x1, y1, x2, y2]) =>
      p(0, 'LINE') + p(8, '0') + p(10, x1) + p(20, y1) + p(30, 0) + p(11, x2) + p(21, y2) + p(31, 0),
    ).join('') +
    p(0, 'ENDBLK')
  );
}

function doc(blocks: string[], entities: string[]): string {
  return (
    p(0, 'SECTION') + p(2, 'HEADER') + p(9, '$ACADVER') + p(1, 'AC1015') + p(0, 'ENDSEC') +
    (blocks.length > 0 ? p(0, 'SECTION') + p(2, 'BLOCKS') + blocks.join('') + p(0, 'ENDSEC') : '') +
    p(0, 'SECTION') + p(2, 'ENTITIES') + entities.join('') + p(0, 'ENDSEC') +
    p(0, 'EOF')
  );
}

// 임의 명명 + 고유 기하 — 전역 휴리스틱(resolveBlockType)이 절대 모르는 블록
const CUSTOM_BLOCK = B('XX-7Q', [[0, 0, 10, 0], [10, 0, 10, 4], [10, 4, 0, 4], [0, 4, 0, 0], [2, 2, 8, 2]]);
const CUSTOM_DOC = doc([CUSTOM_BLOCK], [I('XX-7Q', 50, 50), I('XX-7Q', 50, 150), L(50, 50, 50, 150)]);

describe('린트 — 무효 라이브러리는 이유와 함께 거부된다', () => {
  it('정상 라이브러리는 통과한다 (지문 항목·이름 항목 혼재)', () => {
    const lint = parseSymbolLibrary({
      schemaVersion: 1,
      organization: 'A사',
      entries: [
        { fingerprint: 'fp1:0123456789abcdef', blockNames: ['LEGACY-CB'], deviceType: 'breaker' },
        { blockNames: ['BRK_TYPE2'], deviceType: 'breaker', note: 'B동 표준' },
      ],
    });
    expect(lint.ok).toBe(true);
    expect(lint.library?.entries).toHaveLength(2);
  });

  it('강한 fp2 지문을 정상 계약으로 받는다', () => {
    const lint = parseSymbolLibrary({
      schemaVersion: 1,
      organization: 'A사',
      entries: [{ fingerprint: 'fp2:0123456789abcdef', deviceType: 'breaker' }],
    });
    expect(lint.ok).toBe(true);
  });

  it('별칭 없는 fp1 전용 항목은 0-match로 활성화하지 않고 재등록을 안내한다', () => {
    const lint = parseSymbolLibrary({
      schemaVersion: 1,
      organization: '구형사',
      entries: [{ fingerprint: 'fp1:0123456789abcdef', deviceType: 'breaker' }],
    });

    expect(lint.ok).toBe(false);
    expect(lint.errors.join(' ')).toContain('fp1');
    expect(lint.errors.join(' ')).toContain('blockNames');
  });

  it('표준에 없는 deviceType 은 항목 위치와 함께 거부된다', () => {
    const lint = parseSymbolLibrary({
      schemaVersion: 1, organization: 'A사',
      entries: [{ blockNames: ['X'], deviceType: 'flux-capacitor' }],
    });
    expect(lint.ok).toBe(false);
    expect(lint.errors.join(' ')).toContain('entries[0]');
    expect(lint.errors.join(' ')).toContain('flux-capacitor');
  });

  it('지문도 이름도 없는 항목은 거부된다 — 매칭 키가 없으면 죽은 항목이다', () => {
    const lint = parseSymbolLibrary({
      schemaVersion: 1, organization: 'A사', entries: [{ deviceType: 'breaker' }],
    });
    expect(lint.ok).toBe(false);
  });

  it('루트가 객체가 아니면 거부된다', () => {
    expect(parseSymbolLibrary('[]').ok).toBe(false);
    expect(parseSymbolLibrary([1]).ok).toBe(false);
    expect(parseSymbolLibrary(null).ok).toBe(false);
  });

  it('비문자·빈값·한도 초과 blockNames와 잘려 나갈 note를 조용히 정규화하지 않는다', () => {
    const invalidName = parseSymbolLibrary({
      schemaVersion: 1,
      organization: 'A사',
      entries: [{ fingerprint: 'fp2:0123456789abcdef', blockNames: [42, ''], deviceType: 'breaker' }],
    });
    const invalidNote = parseSymbolLibrary({
      schemaVersion: 1,
      organization: 'A사',
      entries: [{ blockNames: ['CB'], deviceType: 'breaker', note: '가'.repeat(301) }],
    });

    expect(invalidName.ok).toBe(false);
    expect(invalidName.errors.join(' ')).toContain('blockNames');
    expect(invalidNote.ok).toBe(false);
    expect(invalidNote.errors.join(' ')).toContain('note');
  });
});

describe('지문 — 기하 정체성', () => {
  const box = (scale: number) => [
    { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 10 * scale, y: 0 } },
    { type: 'LINE', startPoint: { x: 10 * scale, y: 0 }, endPoint: { x: 10 * scale, y: 4 * scale } },
    { type: 'CIRCLE', center: { x: 5 * scale, y: 2 * scale }, radius: 1 * scale },
  ];

  it('같은 정의는 항상 같은 지문이다 (결정론)', () => {
    expect(fingerprintBlock(box(1))).toBe(fingerprintBlock(box(1)));
    expect(fingerprintBlock(box(1))).toMatch(/^fp2:[0-9a-f]{16}$/);
  });

  it('크기만 다른 복제 정의는 같은 지문이다 — 비율·상대반지름 기반이므로', () => {
    expect(fingerprintBlock(box(3))).toBe(fingerprintBlock(box(1)));
  });

  it('기하가 다르면 지문이 다르다 — 다른 심볼을 같다고 하면 오분류다', () => {
    const other = [...box(1), { type: 'ARC', center: { x: 0, y: 0 }, radius: 2 }];
    expect(fingerprintBlock(other)).not.toBe(fingerprintBlock(box(1)));
  });

  it('엔티티 수와 외곽비가 같아도 내부 선 형상이 다르면 지문이 달라야 한다', () => {
    const rectangleWithHorizontal = [
      { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
      { type: 'LINE', startPoint: { x: 10, y: 0 }, endPoint: { x: 10, y: 4 } },
      { type: 'LINE', startPoint: { x: 10, y: 4 }, endPoint: { x: 0, y: 4 } },
      { type: 'LINE', startPoint: { x: 0, y: 4 }, endPoint: { x: 0, y: 0 } },
      { type: 'LINE', startPoint: { x: 2, y: 2 }, endPoint: { x: 8, y: 2 } },
    ];
    const rectangleWithDiagonal = [
      ...rectangleWithHorizontal.slice(0, 4),
      { type: 'LINE', startPoint: { x: 2, y: 1 }, endPoint: { x: 8, y: 3 } },
    ];

    expect(fingerprintBlock(rectangleWithHorizontal)).not.toBe(fingerprintBlock(rectangleWithDiagonal));
  });

  it('중심·반지름이 같아도 ARC 시작·끝 각도가 다르면 지문이 달라야 한다', () => {
    const upperArc = [{
      type: 'ARC', center: { x: 5, y: 5 }, radius: 5, startAngle: 0, endAngle: Math.PI,
    }];
    const lowerArc = [{
      type: 'ARC', center: { x: 5, y: 5 }, radius: 5, startAngle: Math.PI, endAngle: Math.PI * 2,
    }];

    expect(fingerprintBlock(upperArc)).not.toBe(fingerprintBlock(lowerArc));
  });

  it('타원 비율·폴리라인 bulge·스플라인 제어점·중첩 블록 차이도 지문에 포함한다', () => {
    const ellipse = { type: 'ELLIPSE', center: { x: 0, y: 0 }, majorAxisEndPoint: { x: 10, y: 0 } };
    expect(fingerprintBlock([{ ...ellipse, axisRatio: 0.5 }]))
      .not.toBe(fingerprintBlock([{ ...ellipse, axisRatio: 0.8 }]));

    const polyline = (bulge: number) => [{
      type: 'LWPOLYLINE',
      vertices: [{ x: 0, y: 0, bulge }, { x: 10, y: 0 }],
      shape: false,
    }];
    expect(fingerprintBlock(polyline(0.25))).not.toBe(fingerprintBlock(polyline(0.75)));

    const spline = (middleY: number) => [{
      type: 'SPLINE',
      controlPoints: [{ x: 0, y: 0 }, { x: 5, y: middleY }, { x: 10, y: 0 }],
      degreeOfSplineCurve: 2,
    }];
    expect(fingerprintBlock(spline(2))).not.toBe(fingerprintBlock(spline(4)));

    const nested = (name: string) => [{
      type: 'INSERT', position: { x: 0, y: 0 }, name, xScale: 1, yScale: 1,
    }, { type: 'LINE', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
    expect(fingerprintBlock(nested('INNER-A'))).not.toBe(fingerprintBlock(nested('INNER-B')));
  });

  it('엔티티 순서와 블록 기준점 이동은 같은 형상 지문을 유지한다', () => {
    const original = box(1);
    const translatedAndReordered = [...original].reverse().map((entity) => ({
      ...entity,
      startPoint: entity.startPoint ? { x: entity.startPoint.x + 37, y: entity.startPoint.y - 11 } : undefined,
      endPoint: entity.endPoint ? { x: entity.endPoint.x + 37, y: entity.endPoint.y - 11 } : undefined,
      center: entity.center ? { x: entity.center.x + 37, y: entity.center.y - 11 } : undefined,
    }));

    expect(fingerprintBlock(translatedAndReordered)).toBe(fingerprintBlock(original));
  });

  it('기하 좌표가 전혀 없으면 null — 지어내지 않는다', () => {
    expect(fingerprintBlock([])).toBeNull();
    expect(fingerprintBlock([{ type: 'TEXT' }])).toBeNull();
  });
});

describe('매칭 우선순위', () => {
  const library: SymbolLibrary = {
    schemaVersion: 1,
    organization: 'A사',
    entries: [
      { fingerprint: 'fp1:aaaaaaaaaaaaaaaa', deviceType: 'transformer' },
      { blockNames: ['CB-STD-01'], deviceType: 'breaker' },
    ],
  };
  const index = indexSymbolLibrary(library);

  it('지문이 이름을 이긴다 — 이름은 바뀌어도 기하는 그 심볼의 정체다', () => {
    expect(matchSymbol(index, 'CB-STD-01', 'fp1:aaaaaaaaaaaaaaaa')).toBe('transformer');
  });

  it('지문 미스면 이름 별칭으로 잡는다 (대소문자 무시)', () => {
    expect(matchSymbol(index, 'cb-std-01', 'fp1:bbbbbbbbbbbbbbbb')).toBe('breaker');
    expect(matchSymbol(index, 'CB-STD-01', null)).toBe('breaker');
  });

  it('둘 다 미스면 null', () => {
    expect(matchSymbol(index, 'UNKNOWN-9', null)).toBeNull();
  });

  it('같은 지문이 서로 다른 기기 종류에 등록되면 블록명만 신뢰하고 새 이름은 미인식으로 둔다', () => {
    const collisionIndex = indexSymbolLibrary({
      schemaVersion: 1,
      organization: '충돌사',
      entries: [
        { fingerprint: 'fp1:cccccccccccccccc', blockNames: ['RECT-CB'], deviceType: 'breaker' },
        { fingerprint: 'fp1:cccccccccccccccc', blockNames: ['RECT-SW'], deviceType: 'switch' },
      ],
    });

    expect(matchSymbol(collisionIndex, 'RECT-CB', 'fp1:cccccccccccccccc')).toBe('breaker');
    expect(matchSymbol(collisionIndex, 'RECT-SW', 'fp1:cccccccccccccccc')).toBe('switch');
    expect(matchSymbol(collisionIndex, 'RENAMED-UNKNOWN', 'fp1:cccccccccccccccc')).toBeNull();
  });

  it('같은 블록명 별칭이 서로 다른 종류에 등록되면 지문 없는 입력을 첫 항목으로 오분류하지 않는다', () => {
    const collisionIndex = indexSymbolLibrary({
      schemaVersion: 1,
      organization: '별칭충돌사',
      entries: [
        { blockNames: ['DUPLICATE'], deviceType: 'breaker' },
        { blockNames: ['DUPLICATE'], deviceType: 'switch' },
      ],
    });

    expect(matchSymbol(collisionIndex, 'DUPLICATE', null)).toBeNull();
  });
});

describe('파서 왕복 — 사무소 축적 루프 ①→③', () => {
  it('resolveBlockType 의 기존 계약은 유지된다 (미식별 = load, OrNull = null)', () => {
    expect(resolveBlockTypeOrNull('XX-7Q')).toBeNull();
    expect(resolveBlockType('XX-7Q')).toBe('load');
    expect(resolveBlockType('MCCB-1')).toBe('breaker');
  });

  it('① 라이브러리 없이: 미식별 블록은 unknownSymbols 로 보고된다 (지문 포함·개수 집계)', () => {
    const result = parseDxfToSLD(CUSTOM_DOC);
    expect(result.symbolLibraryApplied).toBeUndefined();
    expect(result.unknownSymbols).toHaveLength(1);
    const unknown = result.unknownSymbols![0];
    expect(unknown.blockName).toBe('XX-7Q');
    expect(unknown.count).toBe(2);
    expect(unknown.fingerprint).toMatch(/^fp2:[0-9a-f]{16}$/);
  });

  it('②→③ 그 지문을 라이브러리에 등록하면 다음 분석에서 자동 인식된다', () => {
    const first = parseDxfToSLD(CUSTOM_DOC);
    const fingerprint = first.unknownSymbols![0].fingerprint!;

    const library: SymbolLibrary = {
      schemaVersion: 1,
      organization: 'A사',
      entries: [{ fingerprint, deviceType: 'breaker', note: '사용자 확정 2026-08-24' }],
    };
    const second = parseDxfToSLD(CUSTOM_DOC, { symbolLibrary: library });

    const custom = second.components.filter((c) => c.properties?.blockName === 'XX-7Q');
    expect(custom).toHaveLength(2);
    expect(custom.every((c) => c.type === 'breaker')).toBe(true);
    expect(second.unknownSymbols).toBeUndefined();
    expect(second.symbolLibraryApplied).toEqual({ organization: 'A사', matched: 2, entryCount: 1 });
  });

  it('엔티티 수·외곽이 같은 다른 블록은 등록 심볼로 오인하지 않는다', () => {
    const horizontal = B('RECT-H', [
      [0, 0, 10, 0], [10, 0, 10, 4], [10, 4, 0, 4], [0, 4, 0, 0], [2, 2, 8, 2],
    ]);
    const diagonal = B('RECT-D', [
      [0, 0, 10, 0], [10, 0, 10, 4], [10, 4, 0, 4], [0, 4, 0, 0], [2, 1, 8, 3],
    ]);
    const collisionDoc = doc([horizontal, diagonal], [I('RECT-H', 0, 0), I('RECT-D', 0, 100)]);
    const first = parseDxfToSLD(collisionDoc);
    const reports = new Map(first.unknownSymbols?.map((symbol) => [symbol.blockName, symbol]));
    const horizontalFingerprint = reports.get('RECT-H')?.fingerprint;

    expect(horizontalFingerprint).toMatch(/^fp2:[0-9a-f]{16}$/);
    expect(reports.get('RECT-D')?.fingerprint).not.toBe(horizontalFingerprint);

    const second = parseDxfToSLD(collisionDoc, {
      symbolLibrary: {
        schemaVersion: 1,
        organization: '충돌방지사',
        entries: [{ fingerprint: horizontalFingerprint!, blockNames: ['RECT-H'], deviceType: 'breaker' }],
      },
    });

    expect(second.components.find((component) => component.properties?.blockName === 'RECT-H')?.type).toBe('breaker');
    expect(second.unknownSymbols?.map((symbol) => symbol.blockName)).toEqual(['RECT-D']);
  });

  it('이름 별칭만으로도 인식된다 — 지문 없이 수기로 만든 라이브러리도 유효', () => {
    const library: SymbolLibrary = {
      schemaVersion: 1,
      organization: 'A사',
      entries: [{ blockNames: ['XX-7Q'], deviceType: 'meter' }],
    };
    const result = parseDxfToSLD(CUSTOM_DOC, { symbolLibrary: library });
    const custom = result.components.filter((c) => c.properties?.blockName === 'XX-7Q');
    expect(custom.every((c) => c.type === 'meter')).toBe(true);
  });

  it('라이브러리는 전역 휴리스틱을 이긴다 — 회사 지식이 일반 추측보다 우선', () => {
    // 'TR-1' 은 휴리스틱상 transformer 지만, 이 회사에서는 다른 의미라고 등록했다면 그쪽이 정답이다.
    const dxf = doc([], [I('TR-1', 0, 0), I('TR-2', 0, 100), L(0, 0, 0, 100)]);
    const library: SymbolLibrary = {
      schemaVersion: 1,
      organization: 'B사',
      entries: [{ blockNames: ['TR-1'], deviceType: 'switch' }],
    };
    const result = parseDxfToSLD(dxf, { symbolLibrary: library });
    expect(result.components.find((c) => c.properties?.blockName === 'TR-1')?.type).toBe('switch');
    // 등록 안 된 TR-2 는 여전히 휴리스틱으로 transformer — 라이브러리가 남을 오염시키지 않는다.
    expect(result.components.find((c) => c.properties?.blockName === 'TR-2')?.type).toBe('transformer');
  });
});
