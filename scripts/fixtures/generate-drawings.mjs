#!/usr/bin/env node
/**
 * 도면 픽스처 생성기 — 선언(drawing-specs) → .dxf + .label.json
 * ─────────────────────────────────────────────────────────────
 * 실행: node scripts/fixtures/generate-drawings.mjs
 *
 * 라벨은 선언에서만 파생된다. 파서를 호출하지 않는다 — 파서 출력으로 정답을
 * 만들면 무슨 버그가 있어도 테스트가 통과한다(닫힌 순환).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dxfDocument, line, lwpolyline, insert, text, circle, arc, blockDef,
} from './dxf-writer.mjs';
import { DRAWING_SPECS } from './drawing-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'fixtures', 'drawings', 'synthetic');

// =========================================================================
// 대규모 도면 생성기 — 선언을 손으로 50줄 쓰는 대신 규칙으로 펼친다.
// 펼친 결과가 곧 정답이므로 여전히 닫힌 순환이 아니다.
// =========================================================================

function generateSubstation({ banks, feedersPerBank, motorsPerFeeder }) {
  const nodes = [];
  const edges = [];
  nodes.push({ name: 'VCB-INCOMING', type: 'breaker', x: 1000, y: 1400 });
  nodes.push({ name: 'MAINBUS', type: 'bus', x: 1000, y: 1300 });
  edges.push(['VCB-INCOMING', 'MAINBUS']);

  for (let b = 1; b <= banks; b++) {
    const bx = 400 + (b - 1) * 1200;
    const tr = `TR-B${b}`;
    const acb = `ACB-B${b}`;
    const bus = `BUSBAR-B${b}`;
    nodes.push({ name: tr, type: 'transformer', x: bx, y: 1150 });
    nodes.push({ name: acb, type: 'breaker', x: bx, y: 1030 });
    nodes.push({ name: bus, type: 'bus', x: bx, y: 910 });
    edges.push(['MAINBUS', tr], [tr, acb], [acb, bus]);

    for (let f = 1; f <= feedersPerBank; f++) {
      const fx = bx - 400 + (f - 1) * 160;
      const panel = `MCC-B${b}F${f}`;
      nodes.push({ name: panel, type: 'panel', x: fx, y: 760 });
      edges.push([bus, panel]);
      for (let m = 1; m <= motorsPerFeeder; m++) {
        const mtr = `MTR-B${b}F${f}M${m}`;
        nodes.push({ name: mtr, type: 'motor', x: fx - 40 + (m - 1) * 80, y: 620 });
        edges.push([panel, mtr]);
      }
    }
  }
  return { nodes, edges };
}

function generateEmergency({ feeders }) {
  const nodes = [
    { name: 'VCB-UTILITY', type: 'breaker', x: 300, y: 1200 },
    { name: 'GEN-EMERGENCY', type: 'generator', x: 1100, y: 1200 },
    { name: 'ATS-1', type: 'switch', x: 700, y: 1060 },
    { name: 'UPS-1', type: 'ups', x: 900, y: 940 },
    { name: 'BUSBAR-EM', type: 'bus', x: 700, y: 920 },
  ];
  const edges = [
    ['VCB-UTILITY', 'ATS-1'],
    ['GEN-EMERGENCY', 'ATS-1'],
    ['ATS-1', 'BUSBAR-EM'],
    ['ATS-1', 'UPS-1'],
  ];
  for (let f = 1; f <= feeders; f++) {
    const fx = 200 + (f - 1) * 140;
    const panel = `DB-EM${f}`;
    const load = `LOAD-EM${f}`;
    nodes.push({ name: panel, type: 'panel', x: fx, y: 780 });
    nodes.push({ name: load, type: 'load', x: fx, y: 650 });
    edges.push(['BUSBAR-EM', panel], [panel, load]);
  }
  return { nodes, edges };
}

function generateDenseMcc({ panels, motorsPerPanel }) {
  const nodes = [{ name: 'BUSBAR-MAIN', type: 'bus', x: 900, y: 1100 }];
  const edges = [];
  for (let p = 1; p <= panels; p++) {
    const px = 200 + (p - 1) * 280;
    const panel = `MCC-P${p}`;
    nodes.push({ name: panel, type: 'panel', x: px, y: 950 });
    edges.push(['BUSBAR-MAIN', panel]);
    for (let m = 1; m <= motorsPerPanel; m++) {
      const mtr = `MTR-P${p}M${m}`;
      nodes.push({
        name: mtr, type: 'motor',
        x: px - 105 + ((m - 1) % 4) * 70,
        y: 820 - Math.floor((m - 1) / 4) * 90,
      });
      edges.push([panel, mtr]);
    }
  }
  return { nodes, edges };
}

function generateMixed({ feeders }) {
  const nodes = [
    { name: 'VCB-MX', type: 'breaker', x: 700, y: 1200 },
    { name: 'TR-MX', type: 'transformer', x: 700, y: 1080 },
    { name: 'CUBICLE-MX', type: 'panel', x: 700, y: 960, nested: ['MCCB-MX1', 'MCCB-MX2'] },
    { name: 'BUSBAR-MX', type: 'bus', x: 700, y: 850 },
  ];
  const edges = [
    ['VCB-MX', 'TR-MX'], ['TR-MX', 'CUBICLE-MX'], ['CUBICLE-MX', 'BUSBAR-MX'],
  ];
  for (let f = 1; f <= feeders; f++) {
    const fx = 160 + (f - 1) * 120;
    const panel = `DB-MX${f}`;
    nodes.push({ name: panel, type: 'panel', x: fx, y: 700 });
    // 절반은 폴리라인 결선, 절반은 직선
    if (f % 2 === 0) {
      edges.push({ from: 'BUSBAR-MX', to: panel, via: [[700, 760], [fx, 760]] });
    } else {
      edges.push(['BUSBAR-MX', panel]);
    }
    // 말단은 원형 심볼 전동기
    const mtr = `MTR-MX${f}`;
    nodes.push({ name: mtr, type: 'motor', x: fx, y: 570, shape: 'circle', radius: 18 });
    edges.push([panel, mtr]);
  }
  return { nodes, edges };
}

const GENERATORS = {
  substation: generateSubstation,
  emergency: generateEmergency,
  'dense-mcc': generateDenseMcc,
  mixed: generateMixed,
};

// =========================================================================
// 선언 → DXF + 라벨
// =========================================================================

function normalizeEdge(e) {
  return Array.isArray(e) ? { from: e[0], to: e[1], via: null } : { via: null, ...e };
}

function buildDrawing(spec) {
  let nodes = spec.nodes ?? [];
  let edges = spec.edges ?? [];

  if (spec.generate) {
    const gen = GENERATORS[spec.generate.kind];
    if (!gen) throw new Error(`unknown generator: ${spec.generate.kind}`);
    const out = gen(spec.generate);
    nodes = out.nodes;
    edges = out.edges;
  }

  const normEdges = edges.map(normalizeEdge);
  const scale = spec.coordScale ?? 1;
  const sc = (v) => v * scale;

  const byName = new Map(nodes.map((n) => [n.name, n]));
  const entities = [];
  const blocks = [];
  const blockNames = new Set();

  // ── 심볼 ──
  for (const n of nodes) {
    if (n.shape === 'circle') {
      entities.push(circle(sc(n.x), sc(n.y), sc(n.radius ?? 15), 'SYMBOL'));
      // 원형 심볼은 이름표를 텍스트로 병기(실무 관례)
      entities.push(text(n.name, sc(n.x + (n.radius ?? 15) + 4), sc(n.y), 'TEXT'));
      continue;
    }

    if (n.nested) {
      // 중첩 블록: 블록 정의 안에 INSERT를 둔다
      const innerBlocks = n.nested.map((inner) =>
        blockDef(inner, [line(-10, -10, 10, 10, 'SYMBOL')]),
      );
      for (const ib of innerBlocks) blocks.push(ib);
      const nestedInserts = n.nested.map((inner, i) => insert(inner, i * 20 - 10, 0, 'SYMBOL'));
      blocks.push(blockDef(n.name, nestedInserts));
      blockNames.add(n.name);
      entities.push(insert(n.name, sc(n.x), sc(n.y), 'SYMBOL', n.rotation ?? 0));
      continue;
    }

    if (!blockNames.has(n.name)) {
      blocks.push(blockDef(n.name, [line(-8, -8, 8, 8, 'SYMBOL')]));
      blockNames.add(n.name);
    }
    entities.push(insert(n.name, sc(n.x), sc(n.y), 'SYMBOL', n.rotation ?? 0));
  }

  // ── raw 지오메트리 박스(블록 미사용 도면 표현) ──
  if (spec.rawSymbolBox) {
    for (const n of nodes) {
      if (n.shape === 'circle') continue;
      const r = 18;
      entities.push(line(sc(n.x - r), sc(n.y - r), sc(n.x + r), sc(n.y - r), 'SYMBOL'));
      entities.push(line(sc(n.x + r), sc(n.y - r), sc(n.x + r), sc(n.y + r), 'SYMBOL'));
      entities.push(line(sc(n.x + r), sc(n.y + r), sc(n.x - r), sc(n.y + r), 'SYMBOL'));
      entities.push(line(sc(n.x - r), sc(n.y + r), sc(n.x - r), sc(n.y - r), 'SYMBOL'));
    }
  }

  // ── 결선 ──
  for (const e of normEdges) {
    const a = byName.get(e.from);
    const b = byName.get(e.to);
    if (!a || !b) throw new Error(`${spec.id}: edge references unknown node ${e.from}→${e.to}`);
    if (e.via && e.via.length) {
      const pts = [[sc(a.x), sc(a.y)], ...e.via.map(([x, y]) => [sc(x), sc(y)]), [sc(b.x), sc(b.y)]];
      entities.push(lwpolyline(pts, 'WIRE'));
    } else {
      entities.push(line(sc(a.x), sc(a.y), sc(b.x), sc(b.y), 'WIRE'));
    }
  }

  // ── 텍스트 ──
  for (const t of spec.texts ?? []) {
    entities.push(text(t.content, sc(t.x), sc(t.y), 'TEXT'));
  }

  // ── 레이어 노이즈(치수선·해칭) ──
  if (spec.noiseLines) {
    for (let i = 0; i < spec.noiseLines; i++) {
      const layer = i % 2 === 0 ? 'DIM' : 'HATCH';
      const y = sc(120 + i * 7);
      entities.push(line(sc(60), y, sc(560), y, layer));
    }
    // 도면틀
    entities.push(lwpolyline(
      [[sc(20), sc(20)], [sc(760), sc(20)], [sc(760), sc(760)], [sc(20), sc(760)], [sc(20), sc(20)]],
      'FRAME',
    ));
  }

  // ── 파서가 다루지 않는 엔티티 1종(무시되는지 관찰) ──
  if ((spec.difficulty ?? []).includes('mixed-dialect')) {
    entities.push(arc(sc(60), sc(1300), sc(25), 0, 180, 'SYMBOL'));
  }

  const dxf = dxfDocument({
    entities,
    blocks,
    version: spec.dxfVersion ?? 'AC1015',
    insunits: spec.dxfInsunits ?? 4,
  });

  // ── 정답 라벨 ──
  const label = {
    id: spec.id,
    source: 'synthetic — ESVA 자체 작도',
    license: 'own-work',
    tier: spec.tier,
    fileDifficulty: spec.difficulty ?? [],
    description: spec.description,
    labelMode: nodes.length > 40 ? 'sampled' : 'full',
    coordScale: scale,
    expected: {
      nodeCount: nodes.length,
      edgeCount: normEdges.length,
      nodes: nodes.map((n) => ({
        name: n.name,
        type: n.type,
        x: sc(n.x),
        y: sc(n.y),
        ...(n.expectRating ? { rating: n.expectRating } : {}),
        ...(n.expectVoltage ? { voltage: n.expectVoltage } : {}),
        ...(n.expectCurrent ? { current: n.expectCurrent } : {}),
      })),
      edges: normEdges.map((e) => ({ from: e.from, to: e.to })),
    },
    invariants: { orphanNodes: 0, danglingEdges: 0, selfLoops: 0 },
  };

  return { dxf, label };
}

// =========================================================================
// 실행
// =========================================================================

mkdirSync(OUT_DIR, { recursive: true });

let nodeTotal = 0;
let edgeTotal = 0;
for (const spec of DRAWING_SPECS) {
  const { dxf, label } = buildDrawing(spec);
  writeFileSync(join(OUT_DIR, `${spec.id}.dxf`), dxf, 'utf8');
  writeFileSync(join(OUT_DIR, `${spec.id}.label.json`), JSON.stringify(label, null, 2), 'utf8');
  nodeTotal += label.expected.nodeCount;
  edgeTotal += label.expected.edgeCount;
  console.log(
    `${spec.id.padEnd(24)} tier=${spec.tier} nodes=${String(label.expected.nodeCount).padStart(3)} ` +
    `edges=${String(label.expected.edgeCount).padStart(3)} [${(spec.difficulty ?? []).join(',')}]`,
  );
}
console.log(`\n${DRAWING_SPECS.length}장 생성 — 총 노드 ${nodeTotal}, 총 결선 ${edgeTotal}`);
console.log(`출력: fixtures/drawings/synthetic/`);
