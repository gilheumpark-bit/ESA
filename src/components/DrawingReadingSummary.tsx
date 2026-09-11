import type { ReadingTally } from '@/lib/drawing-certainty';

export function DrawingReadingSummary({ groups, humanConfirmed, title, causes, missingGroups }: {
  groups: Array<{ kind: string; label: string; counts: ReadingTally }>;
  humanConfirmed?: number;
  missingGroups?: string[];
  causes?: Array<{ label: string; count: number }>;
  title: string;
}) {
  return <section aria-label={title} className="min-w-0 rounded-lg border border-[var(--border-default)] p-3">
    <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
    <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums">
      <thead><tr><th scope="col">대상</th><th scope="col">확정</th><th scope="col">검토 필요</th><th scope="col">미판독</th><th scope="col">검출</th></tr></thead>
      <tbody>{groups.map(({ kind, label, counts }) => <tr key={kind} className="border-t border-[var(--border-default)]">
        <th scope="row" className="py-2 font-medium">{label}</th><td>{counts.confirmed}</td><td>{counts.ambiguous}</td><td>{counts.unread}</td><td>{counts.total}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="mt-2 text-xs text-[var(--text-secondary)]">검출된 항목의 상태입니다. 도면 전체 정답률·자동화율이 아니며, 검출하지 못한 항목의 수는 알 수 없습니다. 범주 간 중복이 있어 합산하지 않습니다.</p>
    {missingGroups && missingGroups.length > 0 && <p className="mt-1 text-xs text-[var(--text-secondary)]">저장 결과에 기록되지 않은 범주: {missingGroups.join(', ')}. 0건으로 집계하지 않습니다.</p>}
    {humanConfirmed !== undefined && <p className="mt-1 text-xs text-[var(--text-secondary)]">현재 확정 중 사람 정정: {humanConfirmed}건 (기기 종류·문자). AI가 새로 해결한 건수와 구분합니다.</p>}
    {causes && causes.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer">미확정 사유별 건수</summary><ul className="mt-1">{causes.map((cause) => <li key={cause.label}>{cause.label}: {cause.count}건</li>)}</ul></details>}
  </section>;
}
