/**
 * 의존성 취약점 래칫 — 알려진 잔여는 통과, **새로 생긴 것은 차단**.
 *
 * 실측 2026-07-30: `npm audit --omit=dev` 가 high 9 건을 낸다. 9 건이 서로 다른
 * 문제가 아니라 **단일 근인**이다 — `brace-expansion` 의 DoS
 * (GHSA-mh99-v99m-4gvg · CVE-2026-14257 · CVSS 7.5)가
 * `exceljs → archiver → {archiver-utils → glob → minimatch, readdir-glob →
 * minimatch}` 로 번져 패키지 9 개로 세어진다.
 *
 * **왜 안 고쳤나.** 패치본은 brace-expansion 5.0.8 인데 5.x 는 export 형태를
 * 바꿔서 `minimatch@3` 의 `expand()` 호출이 깨진다. `overrides` 로 5.0.8 을
 * 강제해 실측한 결과:
 *
 *     npm audit  → 0 건 (해결됨)
 *     jest       → 3,593/3,593 초록  ← 여기서 멈췄으면 깨진 채로 실었다
 *     eslint     → `TypeError: expand is not a function` (exit 2)
 *
 * 같은 파괴가 archiver 쪽에도 일어난다. 그쪽은 lint 처럼 즉시 터지지 않고
 * **엑셀 내보내기를 실행할 때** 터진다 — 수리가 새 회귀를 만드는 전형이라
 * 되돌렸다.
 *
 * **왜 지금 급하지 않나.** 이 취약점은 공격자가 `expand()` 에 넘어가는 문자열을
 * 통제해야 발동한다. 이 저장소에서 glob 패턴은 exceljs 가 xlsx(zip)를 쓸 때
 * 내부적으로만 쓰이고, 앱 코드에 `glob(` 호출이 0 건이라 사용자 입력이 그리로
 * 흘러가는 경로가 없다. 그래도 「지금 안 급함」이지 「안전」이 아니다.
 *
 * **해소 조건.** exceljs 가 archiver 를 최신 계열로 올리면 사라진다. 그때
 * 이 파일과 baseline 을 함께 지운다.
 *
 * 이 게이트가 하는 일: 알려진 수(9)를 넘거나 critical 이 하나라도 생기면 실패.
 * 줄어들면 baseline 을 낮추라고 알린다 — 잔여가 0 처럼 보이지 않게.
 */
import { spawnSync } from 'node:child_process';

/** 실측 기준선. 늘면 새 취약점이고, 줄면 baseline 을 낮춰야 한다. */
const BASELINE = { critical: 0, high: 9 };

const isWindows = process.platform === 'win32';

// Windows 에서 `.cmd` 를 shell 없이 spawn 하면 EINVAL 로 죽는다(Node 20+).
// 인자는 전부 상수라 shell 경유가 주입 표면이 되지 않는다.
// audit 는 취약점이 있으면 exit 1 이므로 status 가 아니라 stdout 을 읽는다.
const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  shell: isWindows,
});

const report = result.stdout;

if (!report) {
  console.error('audit-gate: npm audit 출력이 비었다 — 게이트가 판정할 수 없다.');
  process.exit(2);
}

const found = JSON.parse(report).metadata?.vulnerabilities;
if (!found) {
  console.error('audit-gate: metadata.vulnerabilities 가 없다 — 출력 형식이 바뀌었다.');
  process.exit(2);
}

const problems = [];
for (const level of ['critical', 'high']) {
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
    + '(전량 brace-expansion 단일 근인 · 선언된 잔여)',
  );
}
