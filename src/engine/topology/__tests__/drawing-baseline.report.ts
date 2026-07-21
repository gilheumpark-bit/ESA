/**
 * 기준선 리포트 — 15장 전수 측정표를 콘솔에 출력한다.
 * 실행: npx jest drawing-baseline --silent=false
 *
 * 이건 게이트가 아니라 계측기다. 통과/실패를 내지 않고 숫자만 낸다 —
 * 임계값을 확정하기 전에는 무엇이 정상인지 알 수 없기 때문이다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDxfToSLD } from '../dxf-parser';
import { compareToLabel, pct, type DrawingLabel, type DrawingMetrics } from '../fixture-metrics';

const FIXTURE_DIR = join(process.cwd(), 'fixtures', 'drawings', 'synthetic');

describe('도면 기준선 측정', () => {
  it('전수 측정표 출력', () => {
    const labelFiles = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.label.json')).sort();
    const rows: DrawingMetrics[] = [];

    for (const lf of labelFiles) {
      const label = JSON.parse(readFileSync(join(FIXTURE_DIR, lf), 'utf8')) as DrawingLabel;
      const dxf = readFileSync(join(FIXTURE_DIR, `${label.id}.dxf`), 'utf8');
      rows.push(compareToLabel(label, parseDxfToSLD(dxf)));
    }

    const line = '─'.repeat(108);
    console.log(`\n${line}`);
    console.log(
      '도면'.padEnd(26) + '티어  ' +
      '노드재현  노드정밀  결선재현  결선정밀  타입정확  고아율   스펙재현',
    );
    console.log(line);

    for (const m of rows) {
      console.log(
        m.id.padEnd(26) + `${m.tier}    ` +
        pct(m.nodeRecall).padStart(7) + '  ' +
        pct(m.nodePrecision).padStart(7) + '  ' +
        pct(m.edgeRecall).padStart(7) + '  ' +
        pct(m.edgePrecision).padStart(7) + '  ' +
        pct(m.typeAccuracy).padStart(7) + '  ' +
        pct(m.orphanRate).padStart(6) + '  ' +
        pct(m.specRecall).padStart(7),
      );
    }
    console.log(line);

    // 티어 집계
    for (const tier of ['초', '중', '고']) {
      const t = rows.filter((r) => r.tier === tier);
      if (!t.length) continue;
      const avg = (sel: (m: DrawingMetrics) => number) =>
        t.reduce((s, m) => s + sel(m), 0) / t.length;
      console.log(
        `[${tier}급 평균]`.padEnd(26) + '      ' +
        pct(avg((m) => m.nodeRecall)).padStart(7) + '  ' +
        pct(avg((m) => m.nodePrecision)).padStart(7) + '  ' +
        pct(avg((m) => m.edgeRecall)).padStart(7) + '  ' +
        pct(avg((m) => m.edgePrecision)).padStart(7),
      );
    }

    console.log(`${line}\n`);

    // 실패 상세
    for (const m of rows) {
      if (!m.misses.length) continue;
      console.log(`■ ${m.id} [${m.difficulty.join(',')}]`);
      console.log(
        `  노드 ${m.counts.matchedNodes}/${m.counts.expectedNodes} (파서 산출 ${m.counts.parsedNodes}) · ` +
        `결선 ${m.counts.matchedEdges}/${m.counts.expectedEdges} (파서 산출 ${m.counts.parsedEdges}) · ` +
        `고아 ${m.counts.orphans} · 허공 ${m.counts.danglingEdges} · 자기루프 ${m.counts.selfLoops}`,
      );
      for (const miss of m.misses) console.log(`   - ${miss}`);
      console.log('');
    }

    expect(rows).toHaveLength(15);
  });
});
