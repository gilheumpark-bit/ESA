/**
 * 운영 의존성 취약점 래칫.
 *
 * 2026-08-26 `npm audit --omit=dev` 실측 기준은 critical 0 · high 0이다.
 * 이후 어느 값이든 증가하면 이 게이트가 실패한다. 감소한 기준선이나 과거 취약점
 * 설명을 남겨 현재 위험처럼 보이게 하지 않는다. 과거 변경은 CHANGELOG가 맡는다.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** 실측 기준선. 늘면 새 취약점이고, 줄면 baseline 을 낮춰야 한다. */
const BASELINE = Object.freeze({ critical: 0, high: 0 });

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('audit-gate: npm 실행 경로가 없다. `npm run gate:audit`로 실행할 것.');
  process.exit(2);
}

// 현재 npm CLI를 Node가 직접 실행한다. Windows의 npm.cmd를 shell:true로 호출할
// 때 발생하는 DEP0190 경고와 셸 인자 재해석 표면을 함께 없앤다.
// audit 는 취약점이 있으면 exit 1 이므로 status 가 아니라 stdout 을 읽는다.
const result = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error) {
  console.error(`audit-gate: npm audit 실행 실패 — ${result.error.message}`);
  process.exit(2);
}

const report = result.stdout;

if (!report) {
  console.error('audit-gate: npm audit 출력이 비었다 — 게이트가 판정할 수 없다.');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(report);
} catch {
  console.error('audit-gate: npm audit JSON을 해석할 수 없다.');
  process.exit(2);
}

const found = parsed.metadata?.vulnerabilities;
if (!found) {
  console.error('audit-gate: metadata.vulnerabilities 가 없다 — 출력 형식이 바뀌었다.');
  process.exit(2);
}

const problems = [];
for (const level of ['critical', 'high']) {
  if (!Number.isInteger(found[level]) || found[level] < 0) {
    console.error(`audit-gate: ${level} 취약점 수가 유효하지 않다.`);
    process.exit(2);
  }
  if (found[level] > BASELINE[level]) {
    problems.push(`${level}: ${found[level]} > 기준선 ${BASELINE[level]} — 새 취약점이 들어왔다`);
  }
}

if (problems.length > 0) {
  console.error('audit-gate FAIL');
  for (const line of problems) console.error('  ' + line);
  console.error('  전체 목록: npm audit --omit=dev');
  process.exit(1);
}

const shrunk = ['critical', 'high'].filter((level) => found[level] < BASELINE[level]);
if (shrunk.length > 0) {
  console.log(
    `audit-gate PASS — 잔여가 줄었다(${shrunk.map((l) => `${l} ${found[l]}<${BASELINE[l]}`).join(', ')}). `
    + 'scripts/audit-baseline-gate.mjs 의 BASELINE 을 낮출 것.',
  );
} else {
  console.log(
    `audit-gate PASS — critical ${found.critical} · high ${found.high} `
    + '(기준선 이내)',
  );
}
