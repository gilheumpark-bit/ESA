import { equipmentExclusionBounds, type ExclusionPage } from '../raster-line-exclusions';
import type { SymbolNode } from '../types-v3';

type Bounds = SymbolNode['evidence'][number]['bounds'];

const PAGE: ExclusionPage = { pageIndex: 0, width: 1000, height: 800 };

function evidence(bounds: Bounds, pageIndex = 0) {
  return { evidenceId: `e-${bounds.x}-${bounds.y}`, pageIndex, bounds, confidence: 0.9 };
}

function symbol(overrides: Partial<SymbolNode> & Pick<SymbolNode, 'evidence'>): SymbolNode {
  return {
    id: 'S1',
    displayId: 'P01-S001',
    typeCandidates: [],
    certainty: 'confirmed',
    ...overrides,
  };
}

describe('equipmentExclusionBounds', () => {
  it('모선은 도체이므로 제외 마스크에 넣지 않는다', () => {
    const bus = symbol({
      confirmedType: 'busbar',
      evidence: [evidence({ x: 10, y: 10, w: 400, h: 8 })],
    });
    expect(equipmentExclusionBounds(PAGE, [bus])).toEqual([]);
  });

  it('모선 후보가 첫 자리가 아니어도 제외한다', () => {
    // classifyDevice 는 근거 필드를 하나만 고르므로 이 경우를 놓친다.
    // 마스크가 모선을 덮으면 도체가 통째로 검출에서 사라진다.
    const bus = symbol({
      confirmedType: undefined,
      typeCandidates: ['unknown', 'BUS_BAR'],
      evidence: [evidence({ x: 10, y: 10, w: 400, h: 8 })],
    });
    expect(equipmentExclusionBounds(PAGE, [bus])).toEqual([]);
  });

  it('세로로 긴 기기는 첫 판독 경계를 쓴다', () => {
    const transformer = symbol({
      confirmedType: 'transformer',
      evidence: [
        evidence({ x: 100, y: 100, w: 40, h: 60 }),
        evidence({ x: 90, y: 90, w: 200, h: 200 }),
      ],
    });
    expect(equipmentExclusionBounds(PAGE, [transformer])).toEqual([
      { x: 100, y: 100, w: 40, h: 60 },
    ]);
  });

  it('납작한 비부하 판독은 가장 큰 근거로 넓힌다', () => {
    // 첫 판독이 권선 조각 하나뿐이면 기기 내부를 다 덮지 못한다.
    const flat = symbol({
      confirmedType: 'transformer',
      evidence: [
        evidence({ x: 100, y: 100, w: 80, h: 10 }),
        evidence({ x: 95, y: 95, w: 90, h: 90 }),
      ],
    });
    expect(equipmentExclusionBounds(PAGE, [flat])).toEqual([
      { x: 95, y: 95, w: 90, h: 90 },
    ]);
  });

  it('반복 부하는 근거 합집합을 마스크로 쓴다', () => {
    const load = symbol({
      confirmedType: 'house_load',
      evidence: [
        evidence({ x: 200, y: 300, w: 40, h: 40 }),
        evidence({ x: 210, y: 310, w: 50, h: 60 }),
      ],
    });
    expect(equipmentExclusionBounds(PAGE, [load])).toEqual([
      { x: 200, y: 300, w: 60, h: 70 },
    ]);
  });

  it('지붕만 읽힌 납작한 부하는 아래로 확장하되 페이지를 넘지 않는다', () => {
    const roofOnly = symbol({
      confirmedType: 'load',
      evidence: [evidence({ x: 400, y: 780, w: 100, h: 20 })],
    });
    const [bounds] = equipmentExclusionBounds(PAGE, [roofOnly]);
    expect(bounds).toEqual({ x: 375, y: 780, w: 150, h: 20 });
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(PAGE.height);
  });

  it('다른 페이지 근거만 있는 기호는 제외 대상이 아니다', () => {
    const otherPage = symbol({
      confirmedType: 'motor',
      evidence: [evidence({ x: 10, y: 10, w: 30, h: 30 }, 1)],
    });
    expect(equipmentExclusionBounds(PAGE, [otherPage])).toEqual([]);
  });
});
