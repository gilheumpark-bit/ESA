/**
 * 도면 픽스처 선언 — 15장 (초5·중5·고5)
 * ────────────────────────────────────────
 * 각 도면은 "이렇게 그렸다"는 선언이고, 라벨(정답)은 이 선언에서 파생된다.
 * 파서 출력은 라벨 생성에 **일절 관여하지 않는다** — 관여시키면 닫힌 순환이라
 * 무슨 값이 나와도 통과한다.
 *
 * 티어는 교보재 관례대로 전기 복잡도로 나누되, 각 티어 안에 파일 난이도를
 * 의도적으로 섞는다. 초급 5장을 전부 깨끗한 DXF로 채우면 통과해도 아무것도
 * 증명하지 못한다.
 *
 * `difficulty` 태그가 곧 사냥 대상이다:
 *   clean-dxf | text-spec | circle-symbol | polyline | block-naming
 *   dxf-r12 | nested-block | raw-geometry | text-detached | layer-noise
 *   rotated | unit-meter | large-scale | mixed-dialect
 */

/** 좌표 헬퍼 — 세로 방향 수직 계통 */
const col = (x) => (y) => ({ x, y });

export const DRAWING_SPECS = [
  // ═══════════════════════════════════════════════════════════
  // 초급 — 단상/소규모 분전반, 노드 ≤ 15
  // ═══════════════════════════════════════════════════════════
  {
    id: 'L1-01-basic-radial',
    tier: '초',
    difficulty: ['clean-dxf'],
    description: '단상 분전반 방사형 — INSERT 심볼 + LINE 결선만. 파서 최소 기대선.',
    nodes: [
      { name: 'MCCB-MAIN', type: 'breaker', x: 100, y: 500 },
      { name: 'DB-1', type: 'panel', x: 100, y: 400 },
      { name: 'LOAD-A', type: 'load', x: 40, y: 300 },
      { name: 'LOAD-B', type: 'load', x: 100, y: 300 },
      { name: 'LOAD-C', type: 'load', x: 160, y: 300 },
    ],
    edges: [
      ['MCCB-MAIN', 'DB-1'],
      ['DB-1', 'LOAD-A'],
      ['DB-1', 'LOAD-B'],
      ['DB-1', 'LOAD-C'],
    ],
  },
  {
    id: 'L1-02-text-spec',
    tier: '초',
    difficulty: ['clean-dxf', 'text-spec'],
    description: '정격 텍스트 부착 — TEXT 엔티티가 심볼 근처에 놓임. 스펙 추출 검증.',
    nodes: [
      { name: 'TR-1', type: 'transformer', x: 100, y: 600, expectRating: '500kVA' },
      { name: 'ACB-1', type: 'breaker', x: 100, y: 500, expectCurrent: '800A' },
      { name: 'DB-1', type: 'panel', x: 100, y: 400, expectVoltage: '380V' },
    ],
    edges: [['TR-1', 'ACB-1'], ['ACB-1', 'DB-1']],
    texts: [
      { content: '500kVA', x: 115, y: 600 },
      { content: '800A', x: 115, y: 500 },
      { content: '380V', x: 115, y: 400 },
    ],
  },
  {
    id: 'L1-03-circle-motor',
    tier: '초',
    difficulty: ['clean-dxf', 'circle-symbol'],
    description: '전동기를 CIRCLE 심볼로 작도 — 블록 없이 원으로 그리는 실무 관례.',
    nodes: [
      { name: 'MCCB-1', type: 'breaker', x: 100, y: 500 },
      { name: 'M1', type: 'motor', x: 60, y: 380, shape: 'circle', radius: 15 },
      { name: 'M2', type: 'motor', x: 140, y: 380, shape: 'circle', radius: 15 },
    ],
    edges: [['MCCB-1', 'M1'], ['MCCB-1', 'M2']],
  },
  {
    id: 'L1-04-polyline-route',
    tier: '초',
    difficulty: ['clean-dxf', 'polyline'],
    description: '결선을 LWPOLYLINE 꺾은선으로 작도 — 실제 배선 경로 표현 방식.',
    nodes: [
      { name: 'MCCB-1', type: 'breaker', x: 100, y: 500 },
      { name: 'PANEL-A', type: 'panel', x: 300, y: 350 },
      { name: 'PANEL-B', type: 'panel', x: 300, y: 250 },
    ],
    edges: [
      { from: 'MCCB-1', to: 'PANEL-A', via: [[100, 420], [300, 420]] },
      { from: 'MCCB-1', to: 'PANEL-B', via: [[100, 300], [200, 300], [200, 250]] },
    ],
  },
  {
    id: 'L1-05-block-naming',
    tier: '초',
    difficulty: ['clean-dxf', 'block-naming'],
    description:
      '블록명 어휘 다양화 — MCC·METER·SWGR·LIGHT 등 실무 명칭. ' +
      '심볼 타입 분류기가 이름을 제대로 읽는지가 초점.',
    nodes: [
      { name: 'SWGR-1', type: 'panel', x: 100, y: 600 },
      { name: 'METER-1', type: 'meter', x: 100, y: 500 },
      { name: 'MCC-1', type: 'panel', x: 100, y: 400 },
      { name: 'LIGHT-1', type: 'load', x: 40, y: 300 },
      { name: 'CAP-1', type: 'capacitor', x: 160, y: 300 },
    ],
    edges: [
      ['SWGR-1', 'METER-1'],
      ['METER-1', 'MCC-1'],
      ['MCC-1', 'LIGHT-1'],
      ['MCC-1', 'CAP-1'],
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // 중급 — 3상 4선식·변압기 1뱅크, 노드 15~50
  // ═══════════════════════════════════════════════════════════
  {
    id: 'L2-01-3phase-tr',
    tier: '중',
    difficulty: ['dxf-r12'],
    description: '3상 수전 → 변압기 → ACB → MCC 3면 → 전동기. DXF R12 방언.',
    dxfVersion: 'AC1009',
    nodes: [
      { name: 'VCB-IN', type: 'breaker', x: 400, y: 900 },
      { name: 'CT-1', type: 'meter', x: 400, y: 820 },
      { name: 'TR-1', type: 'transformer', x: 400, y: 740 },
      { name: 'ACB-1', type: 'breaker', x: 400, y: 660 },
      { name: 'BUSBAR-1', type: 'bus', x: 400, y: 580 },
      { name: 'MCC-A', type: 'panel', x: 200, y: 480 },
      { name: 'MCC-B', type: 'panel', x: 400, y: 480 },
      { name: 'MCC-C', type: 'panel', x: 600, y: 480 },
      { name: 'MTR-A1', type: 'motor', x: 150, y: 380 },
      { name: 'MTR-A2', type: 'motor', x: 250, y: 380 },
      { name: 'MTR-B1', type: 'motor', x: 400, y: 380 },
      { name: 'MTR-C1', type: 'motor', x: 600, y: 380 },
    ],
    edges: [
      ['VCB-IN', 'CT-1'], ['CT-1', 'TR-1'], ['TR-1', 'ACB-1'], ['ACB-1', 'BUSBAR-1'],
      ['BUSBAR-1', 'MCC-A'], ['BUSBAR-1', 'MCC-B'], ['BUSBAR-1', 'MCC-C'],
      ['MCC-A', 'MTR-A1'], ['MCC-A', 'MTR-A2'], ['MCC-B', 'MTR-B1'], ['MCC-C', 'MTR-C1'],
    ],
    texts: [
      { content: '22.9kV', x: 420, y: 900 },
      { content: '1000kVA', x: 420, y: 740 },
      { content: '380V', x: 420, y: 580 },
    ],
  },
  {
    id: 'L2-02-nested-block',
    tier: '중',
    difficulty: ['nested-block'],
    description:
      '블록 정의 안에 INSERT가 중첩된 도면 — 심볼을 묶어 하나의 큐비클 블록으로 만드는 관례. ' +
      '모델스페이스만 순회하면 내부 심볼이 통째로 사라진다.',
    nodes: [
      { name: 'ACB-MAIN', type: 'breaker', x: 400, y: 700 },
      { name: 'CUBICLE-1', type: 'panel', x: 400, y: 600, nested: ['MCCB-N1', 'MCCB-N2'] },
      { name: 'LOAD-1', type: 'load', x: 320, y: 480 },
      { name: 'LOAD-2', type: 'load', x: 480, y: 480 },
    ],
    edges: [
      ['ACB-MAIN', 'CUBICLE-1'],
      ['CUBICLE-1', 'LOAD-1'],
      ['CUBICLE-1', 'LOAD-2'],
    ],
  },
  {
    id: 'L2-03-raw-geometry',
    tier: '중',
    difficulty: ['raw-geometry'],
    description:
      '블록을 전혀 쓰지 않고 심볼을 raw LINE/CIRCLE로 직접 작도한 도면. ' +
      '오래된 도면·타 CAD 변환본에서 흔하다.',
    nodes: [
      { name: 'M-RAW-1', type: 'motor', x: 200, y: 400, shape: 'circle', radius: 20 },
      { name: 'M-RAW-2', type: 'motor', x: 400, y: 400, shape: 'circle', radius: 20 },
      { name: 'G-RAW-1', type: 'generator', x: 600, y: 400, shape: 'circle', radius: 20 },
    ],
    edges: [['M-RAW-1', 'M-RAW-2'], ['M-RAW-2', 'G-RAW-1']],
    rawSymbolBox: true,
  },
  {
    id: 'L2-04-text-detached',
    tier: '중',
    difficulty: ['text-detached'],
    description:
      '정격 텍스트가 심볼에서 멀리(근접 임계 초과) 떨어져 인출선으로 연결된 도면. ' +
      '근접도 기반 매핑의 한계를 본다.',
    nodes: [
      { name: 'TR-2', type: 'transformer', x: 300, y: 700, expectRating: '750kVA' },
      { name: 'ACB-2', type: 'breaker', x: 300, y: 600 },
      { name: 'DB-2', type: 'panel', x: 300, y: 500 },
    ],
    edges: [['TR-2', 'ACB-2'], ['ACB-2', 'DB-2']],
    texts: [
      { content: '750kVA', x: 600, y: 720 },
      { content: 'CV 4C 150sq', x: 600, y: 650 },
    ],
  },
  {
    id: 'L2-05-layer-noise',
    tier: '중',
    difficulty: ['layer-noise'],
    description:
      '치수선·해칭·도면틀이 DIM/HATCH 레이어에 다수 존재. 결선으로 오검출되면 정밀도가 무너진다.',
    nodes: [
      { name: 'MCCB-N', type: 'breaker', x: 300, y: 600 },
      { name: 'DB-N', type: 'panel', x: 300, y: 500 },
      { name: 'LOAD-N1', type: 'load', x: 220, y: 400 },
      { name: 'LOAD-N2', type: 'load', x: 380, y: 400 },
    ],
    edges: [
      ['MCCB-N', 'DB-N'], ['DB-N', 'LOAD-N1'], ['DB-N', 'LOAD-N2'],
    ],
    noiseLines: 24,
  },

  // ═══════════════════════════════════════════════════════════
  // 고급 — 수전설비·다중 뱅크, 노드 50+
  // ═══════════════════════════════════════════════════════════
  {
    id: 'L3-01-substation',
    tier: '고',
    difficulty: ['large-scale'],
    description: '수전설비 2뱅크 + 계통 분리. 대규모 방사형.',
    generate: { kind: 'substation', banks: 2, feedersPerBank: 6, motorsPerFeeder: 2 },
  },
  {
    id: 'L3-02-rotated-meter',
    tier: '고',
    difficulty: ['rotated', 'unit-meter'],
    description:
      '회전된 INSERT + 도면 단위가 미터(INSUNITS=6). 좌표 스케일이 바뀌면 ' +
      '끝점 접합 허용오차(bbox 대각선 5%)와 텍스트 근접 임계가 함께 흔들린다.',
    dxfInsunits: 6,
    coordScale: 0.001,
    nodes: [
      { name: 'VCB-R', type: 'breaker', x: 400, y: 800, rotation: 90 },
      { name: 'TR-R', type: 'transformer', x: 400, y: 700, rotation: 45 },
      { name: 'ACB-R', type: 'breaker', x: 400, y: 600, rotation: 180 },
      { name: 'MCC-R', type: 'panel', x: 400, y: 500, rotation: 270 },
      { name: 'MTR-R1', type: 'motor', x: 320, y: 400 },
      { name: 'MTR-R2', type: 'motor', x: 480, y: 400 },
    ],
    edges: [
      ['VCB-R', 'TR-R'], ['TR-R', 'ACB-R'], ['ACB-R', 'MCC-R'],
      ['MCC-R', 'MTR-R1'], ['MCC-R', 'MTR-R2'],
    ],
  },
  {
    id: 'L3-03-emergency',
    tier: '고',
    difficulty: ['large-scale', 'mixed-dialect'],
    description: '비상발전기 + UPS + 절체개폐기 이중 계통. 상용/비상 두 전원.',
    generate: { kind: 'emergency', feeders: 8 },
  },
  {
    id: 'L3-04-dense-mcc',
    tier: '고',
    difficulty: ['large-scale'],
    description: 'MCC 6면 × 전동기 8대 밀집 배치. 노드 밀도가 높아 끝점 접합 오탐이 나기 쉽다.',
    generate: { kind: 'dense-mcc', panels: 6, motorsPerPanel: 8 },
  },
  {
    id: 'L3-05-mixed-dialect',
    tier: '고',
    difficulty: ['mixed-dialect', 'dxf-r12', 'nested-block', 'polyline', 'circle-symbol'],
    description:
      'R12 + 중첩블록 + 폴리라인 결선 + 원형 심볼 + 레이어 노이즈를 한 도면에 혼합. ' +
      '단일 요인 도면을 전부 통과해도 여기서 상호작용 결함이 드러날 수 있다.',
    dxfVersion: 'AC1009',
    generate: { kind: 'mixed', feeders: 10 },
  },
];
