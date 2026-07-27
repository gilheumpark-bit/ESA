import { assignPhysicalEquipmentIds, buildEquipmentCounts } from '../count-register';
import type { SymbolNode } from '../types-v3';
import { EXPANDED_SYMBOL_DB } from '../../vision/symbol-db';

function sym(partial: Partial<SymbolNode> & { id: string; displayId: string }): SymbolNode {
  return {
    typeCandidates: ['vcb'],
    certainty: 'confirmed',
    evidence: [{
      evidenceId: `${partial.id}-e`,
      pageIndex: 0,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      confidence: 1,
    }],
    ...partial,
  };
}

describe('count-register', () => {
  it('separates symbolOccurrences from physicalEquipmentCount', () => {
    const symbols = [
      sym({ id: 'a', displayId: 'P01-S001', confirmedType: 'vcb', certainty: 'confirmed' }),
      sym({ id: 'b', displayId: 'P02-S001', confirmedType: 'vcb', certainty: 'confirmed' }),
      sym({ id: 'c', displayId: 'P01-S002', confirmedType: 'vcb', certainty: 'ambiguous' }),
    ];
    const links = assignPhysicalEquipmentIds(symbols, [{
      id: 'xr1',
      displayId: 'XR001',
      fromPage: 0,
      toPage: 1,
      fromRef: 'a',
      toRef: 'b',
      status: 'confirmed',
      evidence: [],
    }]);
    const rows = buildEquipmentCounts(symbols, links, [], []);
    const vcb = rows.find((r) => r.equipmentKind.includes('VCB') || r.equipmentKind.includes('breaker'));
    expect(vcb).toBeDefined();
    expect(vcb!.symbolOccurrences).toBe(3);
    expect(vcb!.confirmed).toBe(2);
    expect(vcb!.ambiguous).toBe(1);
    expect(vcb!.physicalEquipmentCount).toBe(1); // merged a+b
    expect(vcb!.countStatus).toBe('CONDITIONAL');
  });

  it('never puts ambiguous into confirmed', () => {
    const symbols = [
      sym({ id: 'x', displayId: 'P01-S001', confirmedType: 'pt', certainty: 'ambiguous', typeCandidates: ['pt'] }),
    ];
    const rows = buildEquipmentCounts(symbols, new Map(), [], []);
    const row = rows[0];
    expect(row.confirmed).toBe(0);
    expect(row.ambiguous).toBe(1);
    expect(row.physicalEquipmentCount).toBeNull();
  });

  it('counts a boundary coverage gap as missing suspected instead of zero', () => {
    const symbols = [sym({ id: 'a', displayId: 'P01-S001', confirmedType: 'vcb' })];
    const rows = buildEquipmentCounts(symbols, new Map([['a', 'E001']]), [], [{
      id: 'clip-1', code: 'BOUNDARY_CLIP', pageIndex: 0,
      bounds: { x: 0, y: 0, w: 100, h: 100 }, note: '경계 잘림',
    }]);
    expect(rows[0]).toMatchObject({ missingSuspected: 1, countStatus: 'HOLD' });
  });
});

/**
 * 기기 대수 집계는 사용자가 읽는 표다. 계량·계측 기기를 전력변압기 행에
 * 합치면 수배전반 도면 한 장에서 TR 1 대가 8 대로 보인다(TR 1 + CT 3 + PT 3 + MOF 1).
 *
 * `normalizeKind` 가 일반 분기(`includes('transformer')`)를 특수 분기보다
 * 먼저 검사해 `transformer_ct`·`transformer_vt` 가 전부 'transformer' 로
 * 뭉개졌다 — `PT/PPT` 분기는 정규화된 타입에 대해 도달 불가였다.
 * 이번 세션에 `standards-team` 의 `"비교"` 가 주제 키워드에 먼저 걸려
 * 비교 분기에 못 가던 것과 같은 형태다.
 */
describe('count-register — 계량·계측 기기는 전력변압기와 따로 센다', () => {
  const kindsOf = (types: string[]) =>
    buildEquipmentCounts(
      types.map((t, i) => sym({ id: `s${i}`, displayId: `P01-S${i}`, confirmedType: t })),
      new Map(),
      [],
      [],
    );

  it('CT·PT·MOF 가 전력변압기 행에 합산되지 않는다', () => {
    const rows = kindsOf(['transformer', 'transformer_ct', 'transformer_vt', 'metering_outfit']);
    const power = rows.find((r) => r.equipmentKind === 'transformer');
    expect(power).toBeDefined();
    expect(power!.symbolOccurrences).toBe(1);
    // 나머지 셋은 각자 다른 행으로 나뉜다.
    expect(new Set(rows.map((r) => r.equipmentKind)).size).toBe(4);
  });

  it('건식·유입 변압기는 전력변압기로 함께 센다', () => {
    const rows = kindsOf(['transformer', 'transformer_dry']);
    const power = rows.find((r) => r.equipmentKind === 'transformer');
    expect(power!.symbolOccurrences).toBe(2);
  });

  /**
   * 위 두 단언은 내가 아는 타입만 본다. 정작 원래 결함은 `count-register`
   * 안에 리터럴로 존재하지도 않는 값(`transformer_ct`)이 삼켜진 것이었다 —
   * 가려진 값이 다른 모듈(symbol-db)에 살아서 그 파일만 읽어선 안 보인다.
   *
   * 그래서 **심볼 표 전체**를 집계기에 통과시키고, 분류가 다른 기기가 같은
   * 집계 행에 합쳐지지 않는지 본다. 심볼이 추가돼도 같이 커진다.
   */
  it('심볼 표 전 항목 — 분류(category)가 다른 기기가 한 행에 합쳐지지 않는다', () => {
    expect(EXPANDED_SYMBOL_DB.length).toBeGreaterThanOrEqual(40);

    const kindOf = new Map<string, string>();
    for (const entry of EXPANDED_SYMBOL_DB) {
      const rows = kindsOf([entry.type]);
      kindOf.set(entry.type, rows[0].equipmentKind);
    }

    const categoriesPerKind = new Map<string, Set<string>>();
    for (const entry of EXPANDED_SYMBOL_DB) {
      const kind = kindOf.get(entry.type)!;
      const set = categoriesPerKind.get(kind) ?? new Set<string>();
      set.add(entry.category);
      categoriesPerKind.set(kind, set);
    }

    const mixed = [...categoriesPerKind.entries()]
      .filter(([, cats]) => cats.size > 1)
      .map(([kind, cats]) => `${kind}: ${[...cats].join(' + ')}`);
    expect(mixed).toEqual([]);
  });
});
