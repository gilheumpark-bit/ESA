/** Security audit decisions are separate from the npm process and never fail open. */
export function auditScopeFromArgs(args) {
  if (args.length === 0) return 'production';
  if (args.length === 1 && args[0] === '--include-dev') return 'all';
  throw new Error('사용법: npm run gate:audit 또는 npm run gate:audit:all');
}

export function auditArguments(scope) {
  if (!['production', 'all'].includes(scope)) throw new Error('지원하지 않는 감사 범위');
  return ['audit', scope === 'all' ? '--include=dev' : '--omit=dev', '--json'];
}

export function inspectAuditExecution(result) {
  const unknown = (message) => ({ code: 2, message, counts: null });
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    return unknown('npm audit 실행이 정상 종료되지 않아 판정할 수 없습니다.');
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return unknown('npm audit JSON을 해석할 수 없습니다.'); }
  if (!report || report.error || report.auditReportVersion !== 2) {
    return unknown('감사 응답 오류 또는 지원하지 않는 보고서 형식입니다.');
  }
  const counts = report.metadata?.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (!counts || ![...levels, 'total'].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    || levels.reduce((sum, key) => sum + counts[key], 0) !== counts.total
    || (result.status === 1 && counts.total === 0)) {
    return unknown('취약점 집계 또는 종료 코드가 일관되지 않습니다.');
  }
  return {
    code: counts.critical > 0 || counts.high > 0 ? 1 : 0,
    message: `critical ${counts.critical} · high ${counts.high} · total ${counts.total} (critical/high 허용 0)`,
    counts: Object.fromEntries([...levels, 'total'].map((key) => [key, counts[key]])),
  };
}
