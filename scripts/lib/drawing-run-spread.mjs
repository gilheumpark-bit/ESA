/**
 * 같은 셀을 여러 번 실행한 결과를 하나의 판정으로 접는다.
 *
 * 2026-08-04 중급 3회 실측에서 같은 스냅샷·같은 도면·같은 모델이
 * 퓨즈 14→11→5, 종합 73/75/70% 로 흔들렸다(VALIDATION_EVIDENCE 10차).
 * 그 폭에서는 단발 수치로 개선을 주장할 수 없다. 그래서 대표값을
 * **평균이 아니라 최저점**으로 잡고, 폭과 회차별 값을 함께 남긴다.
 *
 * 평균을 쓰지 않는 이유: 도면 판독은 한 회차만 무너져도 그 산출물로
 * 검토서를 쓸 수 없다. 평균은 그 회차를 지운다.
 */

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function collect(runs, pick) {
  return runs.map(pick).filter((value) => value !== null && value !== undefined);
}

function spreadOf(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    median: sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
    spread: sorted[sorted.length - 1] - sorted[0],
    values,
  };
}

/**
 * 회차별 기호 판독 수를 타입별로 모은다. 어떤 타입이 흔들리는지가
 * 곧 다음 수리 대상이므로 종합 점수보다 이 표가 중요하다.
 */
export function symbolTypeSpread(runs) {
  const types = new Map();
  for (const run of runs) {
    for (const check of run.scores?.symbolChecks ?? []) {
      if (!types.has(check.type)) types.set(check.type, { expected: check.expected, actual: [] });
      types.get(check.type).actual.push(check.actual);
    }
  }
  return Object.fromEntries([...types.entries()].map(([type, entry]) => [type, {
    expected: entry.expected,
    ...spreadOf(entry.actual),
  }]));
}

/**
 * 회차 묶음을 하나의 셀 판정으로 접는다.
 *
 * - `representative` 는 최저 종합 점수 회차다. 이 회차의 문서를 영수증에
 *   남겨야 무너진 판독을 사후에 볼 수 있다.
 * - 실행이 하나라도 ERROR/CONFIGURATION_MISMATCH 면 셀 전체가 그 상태다.
 *   한 번이라도 못 돈 설정은 안정적이라고 말할 수 없다.
 */
export function foldRunSpread(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error('EMPTY_RUN_SET');

  const broken = runs.find((run) => run.status !== 'COMPLETE');
  const accuracy = spreadOf(collect(runs, (run) => finite(run.scores?.labelAccuracyPct)));
  const relation = spreadOf(collect(runs, (run) => finite(run.scores?.relationCoveragePct)));
  const duration = spreadOf(collect(runs, (run) => finite(run.durationMs)));
  const calls = spreadOf(collect(runs, (run) => finite(run.vlmCalls)));

  // 대표 회차 = 최저 종합. 동점이면 먼저 실행한 회차.
  const representative = accuracy === null
    ? runs[0]
    : runs.reduce((worst, run) =>
      (run.scores?.labelAccuracyPct ?? Infinity) < (worst.scores?.labelAccuracyPct ?? Infinity)
        ? run
        : worst);

  // 품질은 회차 중 하나라도 PASS 가 아니면 PASS 가 아니다.
  const verdicts = runs.map((run) => run.verdict ?? 'UNKNOWN');
  const verdict = verdicts.every((value) => value === 'PASS')
    ? 'PASS'
    : verdicts.includes('FAIL') ? 'FAIL' : verdicts.find((value) => value !== 'PASS') ?? 'UNKNOWN';

  return {
    runCount: runs.length,
    status: broken ? broken.status : 'COMPLETE',
    verdict,
    accuracy,
    relation,
    duration,
    calls,
    symbolTypes: symbolTypeSpread(runs),
    // 회차별 요약. 문서는 대표 회차만 남긴다.
    runs: runs.map((run, index) => ({
      index: index + 1,
      status: run.status,
      verdict: run.verdict ?? 'UNKNOWN',
      labelAccuracyPct: run.scores?.labelAccuracyPct ?? null,
      relationCoveragePct: run.scores?.relationCoveragePct ?? null,
      durationMs: run.durationMs ?? null,
      vlmCalls: run.vlmCalls ?? null,
      finalStatus: run.finalStatus ?? null,
      error: run.error ?? null,
    })),
    representativeIndex: runs.indexOf(representative) + 1,
  };
}

/**
 * 표 한 줄. 반복이 1회면 종전과 같은 단일 수치를, 2회 이상이면
 * `최저~최고` 로 적어 단발로 오독되지 않게 한다.
 */
export function formatSpread(entry, unit = '') {
  if (entry === null || entry === undefined) return '-';
  if (entry.values.length === 1) return `${entry.worst}${unit}`;
  return `${entry.worst}~${entry.best}${unit}`;
}

// IDENTITY_SEAL: scripts/lib/drawing-run-spread | role=반복 실행을 최저점·폭으로 접기 | inputs=회차별 영수증 | outputs=셀 판정
