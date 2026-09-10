from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=[]
def edit(name,fn):
 p=Path(name);assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.append(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:95]);return s.replace(a,b)
def admin(s):
 s=rep(s,"import { useState, useEffect, useCallback } from 'react';", "import { useState, useCallback } from 'react';\nimport { useFeatureResource } from '@/hooks/useFeatureResource';\nimport { featureAuthenticatedFetch } from '@/lib/feature-auth';\nimport { FeatureRequestError, requestFeatureJson, requireRecord, requireArray, isRecord, unwrapFeatureResponse } from '@/lib/feature-request';\nimport { featureCsv } from '@/lib/feature-output';")
 s=rep(s,'const AUDIT_PAGE_SIZE = 10;', '''function decodeAudit(value: unknown) {
  const body = requireRecord(unwrapFeatureResponse(value));
  const entries = requireArray(body.entries, (row): row is AuditRow => isRecord(row)
    && ['id','userId','action','resource','createdAt'].every((key) => typeof row[key] === 'string')
    && (row.ip === undefined || typeof row.ip === 'string'), 20);
  if (!Number.isSafeInteger(body.totalPages) || Number(body.totalPages) < 1 || !Number.isSafeInteger(body.totalCount)) throw new FeatureRequestError('감사로그 페이지 정보가 올바르지 않습니다.');
  return { entries, totalPages: Number(body.totalPages), totalCount: Number(body.totalCount) };
}''')
 s=rep(s,'  const [entries] = useState<AuditRow[]>(initialEntries);','  const { user } = useAuth();')
 a=s.index('  const filtered = entries.filter');b=s.index('  const handleExportCSV',a)
 s=s[:a]+'''  const params = new URLSearchParams({ page: String(page), action: actionFilter, search: searchQuery });
  const query = params.toString();
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/admin/audit?${query}`, { signal }, decodeAudit, featureAuthenticatedFetch), [query]);
  const resource = useFeatureResource(user ? `audit:${user.uid}:${query}` : null, loader);
  const entries = resource.data?.entries ?? initialEntries;
  const filtered = entries;
  const totalPages = resource.data?.totalPages ?? 1;
  const pageEntries = entries;
  const [exportError, setExportError] = useState<string | null>(null);
''' +s[b:]
 a=s.index('      const csv = filtered.map');b=s.index('      const url = URL.createObjectURL(blob);',a)
 s=s[:a]+'''      setExportError(null);
      const csv = featureCsv(['Timestamp', 'User', 'Action', 'Resource', 'IP'], filtered.map((entry) =>
        [entry.createdAt, entry.userId, entry.action, entry.resource, entry.ip ?? '']));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
'''+s[b:]
 s=rep(s,'      URL.revokeObjectURL(url);\n    } finally {', "      setTimeout(() => URL.revokeObjectURL(url), 1000);\n    } catch { setExportError('CSV를 내보내지 못했습니다. 다시 시도해 주세요.'); } finally {")
 a=s.index('function AuditLogSection(');b=s.index('// ═══',a);block=s[a:b]
 block=rep(block,'  return (','''  if (resource.loading) return <p role="status" className="p-4 text-sm">감사로그를 조회하고 있습니다.</p>;
  if (resource.error) return <div className="p-4"><p role="alert">{resource.error}</p><button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-3">다시 시도</button></div>;
  return (''')
 block=rep(block,'      {/* Filters */}', '''      <p className="text-sm text-[var(--text-secondary)]">서버의 감사로그 전체를 페이지별로 조회합니다. CSV는 현재 조회 페이지의 {entries.length}건만 포함합니다.</p>
      {exportError && <p role="alert" className="text-sm text-[var(--drawing-error-text)]">{exportError}</p>}
      {/* Filters */}''')
 block=block.replace('placeholder="리소스 검색..."','placeholder="리소스 검색..."\n            aria-label="감사로그 리소스 검색"\n            maxLength={200}')
 block=block.replace('value={actionFilter}', 'aria-label="감사로그 액션"\n            value={actionFilter}')
 block=block.replace('onClick={() => setPage(p => Math.max(1, p - 1))}','aria-label="이전 감사로그 페이지"\n            onClick={() => setPage(p => Math.max(1, p - 1))}')
 block=block.replace('onClick={() => setPage(p => Math.min(totalPages, p + 1))}','aria-label="다음 감사로그 페이지"\n            onClick={() => setPage(p => Math.min(totalPages, p + 1))}')
 block=block.replace('CSV 내보내기','현재 페이지 CSV 내보내기').replace('{filtered.length}건 표시','현재 {filtered.length}건 / 전체 {resource.data?.totalCount ?? 0}건')
 block=block.replace('<tbody>','<tbody>\n            {!entries.length && <tr><td colSpan={5} className="p-6 text-center">조회 조건에 맞는 감사로그가 없습니다.</td></tr>}')
 s=s[:a]+block+s[b:]
 a=s.index('  const { tier } = useAuth();');b=s.index('  // Gate: enterprise only',a)
 s=s[:a]+'''  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('tenant');
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson('/api/admin', { signal }, (value) => {
    const envelope = requireRecord(value);
    if (envelope.ok !== true || envelope.source !== 'database') throw new FeatureRequestError('관리 데이터 저장소를 확인하지 못했습니다. 임의의 값은 표시하지 않습니다.');
    const data = requireRecord(envelope.data);
    if (!Array.isArray(data.users) || !Array.isArray(data.auditLog) || !Array.isArray(data.usage) || !isRecord(data.counts)
      || (data.tenant !== null && !isRecord(data.tenant))) throw new FeatureRequestError('관리자 응답 형식 오류');
    return data as unknown as AdminData;
  }, featureAuthenticatedFetch), []);
  const resource = useFeatureResource(authLoading || !user ? null : `admin:${user.uid}`, loader);
  const data = resource.data ?? null, loading = authLoading || resource.loading;
  const dataSource: 'database' | 'unavailable' = data ? 'database' : 'unavailable';
  const loadError = resource.error;

''' +s[b:]
 s=rep(s,"  // Gate: enterprise only\n  if (tier !== 'enterprise') {", "  // Server role determines access; a subscription is not an admin credential.\n  if (!authLoading && (!user || resource.status === 401 || resource.status === 403)) {")
 s=rep(s,'          {loadError}\n        </div>', '''          <p>{loadError}</p><button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-4">다시 시도</button>
        </div>''')
 s=rep(s,"{data?.tenant?.name ?? 'ESVA'} - Enterprise 관리", "{data?.tenant?.name ?? 'ESVA'} - 시스템 관리자")
 s=rep(s,'onClick={() => setActiveTab(key)}','onClick={() => setActiveTab(key)}\n                aria-pressed={activeTab === key}')
 return s
edit('src/app/(with-nav)/admin/page.tsx',admin)

def notifications(s):
 s=rep(s,"    const type = searchParams.get('type') as NotificationType | null;", "    const type = searchParams.get('type') as NotificationType | null;\n    if (type && !VALID_TYPES.includes(type)) return NextResponse.json({ error: '알림 종류를 확인해 주세요.' }, { status: 400 });")
 s=rep(s,"const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);", "const page = Math.min(10000, Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1));")
 s=rep(s,'return NextResponse.json({ success: true, ...result });', "return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });")
 s=rep(s,'    const body = await req.json();\n    const { notificationId, userId, markAll }', '''    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || (body.markAll !== undefined && typeof body.markAll !== 'boolean')
      || (body.notificationId !== undefined && (typeof body.notificationId !== 'string' || body.notificationId.length > 128))) {
      return NextResponse.json({ error: '읽음 처리 요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const { notificationId, userId, markAll }''')
 s=rep(s,'    if (markAll) {','    if (markAll === true) {')
 return s
edit('src/app/api/notifications/route.ts',notifications)
# Admin overview also carries private user data; do not permit cache reuse.
edit('src/app/api/admin/route.ts',lambda s:rep(s,'  return NextResponse.json(response);', "  return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } });"))
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('\n'.join(changed)+'\n')
print('ADMIN_AND_NOTIFICATION_INTEGRATIONS',changed)
