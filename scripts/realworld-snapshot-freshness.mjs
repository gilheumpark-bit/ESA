/**
 * 실도면 실증 스냅샷이 코드보다 낡았는지 본다.
 *
 * 왜 필요한가 — 실측 2026-07-30: `fixtures/drawings/realworld/results/` 의
 * 5 건이 **7/21 커밋 산출물**인데 파서는 **7/28** 에 고쳐졌다. 그 일주일 사이에
 * confidence 상수 문제와 표 문서 판정이 들어갔는데, 스냅샷에는 없다.
 *
 * 그 낡은 파일을 현재 상태로 읽고 다음을 전부 잘못 판정했다:
 *   - 「표 페이지를 conf 0.85 로 통과시킨다」  → 실제로는 0.55 + 표 6 개 추출
 *   - 「confidence 가 5 장 전부 0.85 인 상수」 → 실제로는 등급이 작동
 *   - 「schedule-table-parser 가 미배선」      → 배선돼 있음
 *
 * 스냅샷은 **정의상 과거의 사진**이다. 생성 시각도 어느 코드에서 나왔는지도
 * 파일 안에 없다. 그래서 사람이 「지금 이렇다」로 읽는다 — 그걸 막는다.
 *
 * 판정: 스냅샷을 만든 커밋보다 파이프라인 소스가 더 최근이면 STALE.
 * 갱신 방법은 실패 메시지에 적는다.
 */
import { spawnSync } from 'node:child_process';

const SNAPSHOT_DIR = 'fixtures/drawings/realworld/results';

/** 스냅샷의 값을 바꿀 수 있는 소스. 늘어나면 여기 추가한다. */
const PIPELINE_SOURCES = [
  'src/engine/topology/pdf-vector-parser.ts',
  'src/engine/topology/schedule-table-parser.ts',
  'src/engine/topology/spec-text.ts',
  'src/engine/topology/endpoint-snap.ts',
  'src/engine/topology/topology-graph.ts',
  'src/engine/review/circuit-review.ts',
  'src/engine/review/cross-constraint.ts',
  'src/app/api/pdf-drawing/route.ts',
];

// `git` 은 실행 파일이라 shell 을 태우지 않는다. Windows 에서 shell 을 태우면
// cmd 가 `--format=%ct` 의 `%ct` 를 환경변수로 먹어 빈 문자열이 돌아온다
// (실측 2026-07-30: 전 항목이 «커밋 없음» 으로 나와 게이트가 거짓 STALE).
/** 마지막 커밋 시각(UNIX). 커밋이 없으면 null. */
function lastCommitEpoch(pathspec) {
  const r = spawnSync('git', ['log', '-1', '--format=%ct', '--', pathspec], {
    encoding: 'utf8',
  });
  const text = (r.stdout ?? '').trim();
  return text ? Number(text) : null;
}

function lastCommitLabel(pathspec) {
  const r = spawnSync('git', ['log', '-1', '--format=%h %ad', '--date=short', '--', pathspec], {
    encoding: 'utf8',
  });
  return (r.stdout ?? '').trim() || '(커밋 없음)';
}

const snapshotEpoch = lastCommitEpoch(SNAPSHOT_DIR);
if (snapshotEpoch === null) {
  console.error(`snapshot-freshness: ${SNAPSHOT_DIR} 에 커밋 이력이 없다 — 판정할 수 없다.`);
  process.exit(2);
}

const newer = [];
for (const source of PIPELINE_SOURCES) {
  const epoch = lastCommitEpoch(source);
  if (epoch !== null && epoch > snapshotEpoch) {
    newer.push({ source, label: lastCommitLabel(source) });
  }
}

if (newer.length > 0) {
  console.error('snapshot-freshness FAIL — 실도면 스냅샷이 파이프라인보다 낡았다.');
  console.error(`  스냅샷: ${lastCommitLabel(SNAPSHOT_DIR)}`);
  for (const { source, label } of newer) console.error(`  더 최근: ${label}  ${source}`);
  console.error('');
  console.error('  이 상태의 스냅샷을 «현재 성능» 으로 읽으면 안 된다. 갱신:');
  console.error('    1) 개발 서버 기동 (port 3010)');
  console.error('    2) node scripts/run-realworld-tier.mjs <pdf> <page> <out.json> 를 5 건에 대해 실행');
  console.error('    3) 갱신된 결과를 스냅샷과 함께 커밋');
  process.exit(1);
}

console.log(
  `snapshot-freshness PASS — 스냅샷 ${lastCommitLabel(SNAPSHOT_DIR)} 이 `
  + `파이프라인 소스 ${PIPELINE_SOURCES.length} 개보다 최신이거나 같다.`,
);
