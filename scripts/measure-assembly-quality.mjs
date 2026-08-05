/**
 * 저장된 도면 작업들의 조립 품질을 잰다 — 정답 라벨 없이.
 *
 * 사용:
 *   node scripts/measure-assembly-quality.mjs <작업저장소경로> [<경로2> ...]
 *
 * `<작업저장소경로>` 는 `DRAWING_JOB_STORE_DIR` 로 지정했던 폴더다(그 아래
 * `jobs/*.json`). 여러 개를 주면 팔끼리 나란히 비교한다.
 *
 * 라벨 점수와 달리 이 값들은 정답을 필요로 하지 않으므로, 정답이 없는 새
 * 도면에서도 조립기 회귀를 잡을 수 있다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { assemblyMetrics, foldAssemblyMetrics, formatRatio } from './lib/drawing-assembly-metrics.mjs';

const dirs = process.argv.slice(2).filter((value) => !value.startsWith('--'));
if (dirs.length === 0) {
  console.error('usage: node scripts/measure-assembly-quality.mjs <jobStoreDir> [<dir2> ...]');
  process.exit(2);
}

function tierOf(fileName) {
  if (/wiki/i.test(fileName)) return '초급';
  if (/wiring/i.test(fileName)) return '중급';
  if (/kimm/i.test(fileName)) return '고급';
  return fileName.slice(0, 12) || '?';
}

function loadRuns(dir) {
  const jobsDir = existsSync(join(dir, 'jobs')) ? join(dir, 'jobs') : dir;
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(join(jobsDir, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .flatMap(({ f }) => {
      let job;
      try { job = JSON.parse(readFileSync(join(jobsDir, f), 'utf8')); } catch { return []; }
      const graph = job.document?.evidenceGraph;
      if (!graph?.symbols?.length) return [];
      return [{
        tier: tierOf(job.sourceMetadata?.fileName ?? ''),
        metrics: assemblyMetrics(graph, job.document?.unresolvedItems ?? []),
      }];
    });
}

const COLUMNS = [
  ['확정', 'confirmed', false],
  ['모호', 'ambiguous', false],
  ['미병합쌍', 'unmergedPairs', false],
  ['  겹침', 'unmergedOverlapping', false],
  ['  인접', 'unmergedAdjacent', false],
  ['조각', 'slivers', false],
  ['갇힌표기', 'containedMarkings', false],
  ['지정문자', 'designatorLabels', false],
  ['미병합비', 'unmergedPairRatio', true],
  ['조각비', 'sliverRatio', true],
  ['모호비', 'ambiguousRatio', true],
];

for (const dir of dirs) {
  const runs = loadRuns(dir);
  if (runs.length === 0) {
    console.log(`\n## ${basename(dir)} — 판독 결과 없음`);
    continue;
  }
  console.log(`\n## ${basename(dir)}  (실행 ${runs.length})`);

  const byTier = new Map();
  for (const run of runs) {
    if (!byTier.has(run.tier)) byTier.set(run.tier, []);
    byTier.get(run.tier).push(run.metrics);
  }

  for (const [tier, list] of byTier) {
    const folded = foldAssemblyMetrics(list);
    console.log(`\n  [${tier}] 실행 ${folded.runCount}`);
    for (const [label, key, isRatio] of COLUMNS) {
      const cell = folded[key];
      if (!cell) continue;
      const shown = isRatio
        ? `최악 ${formatRatio(cell.worst)}  최선 ${formatRatio(cell.best)}  폭 ${formatRatio(cell.spread)}`
        : `최악 ${String(cell.worst).padStart(4)}  최선 ${String(cell.best).padStart(4)}  폭 ${String(cell.spread).padStart(4)}`;
      console.log(`    ${label.padEnd(9)} ${shown}   [${cell.values.join(', ')}]`);
    }
  }
}
